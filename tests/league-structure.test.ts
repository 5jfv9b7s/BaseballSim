import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeagueStructureDefinitions } from '../src/data/world/league-structure.ts';
import { createNewPlayOptions } from '../src/data/world/new-play-options.ts';
import { stadiums } from '../src/data/stadiums/index.ts';
import {
  createLeagueStructureWorld,
  createPlayerProfileWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import { gameStadium, squadParticipation, stadiumByRef } from '../src/world/league-structure.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { WorldWorkspace } from '../src/world/workspace.ts';
import type { WorldDefinitions, WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  assert.equal(worldPhase(world), 'readyToComplete');
  return completeDay(world, world.currentDate);
}

test('大会構造：短期・年間の全一二軍と開催球場を保存内のIDで結び付ける', () => {
  for (const calendar of ['short', 'annual'] as const) {
    const world = createLeagueStructureWorld(
      1,
      undefined,
      createLeagueStructureDefinitions(calendar),
    );
    validateWorld(world);
    const d = world.definitions,
      data = d.leagueStructure!;
    assert.equal(d.version, 'world-definitions-v17');
    assert.equal(data.clubs.length, 4);
    assert.equal(data.squads.length, 8);
    assert.equal(data.leagues.length, 2);
    assert.equal(data.competitions.length, 2);
    assert.equal(data.participations.length, 8);
    assert.equal(data.stadiums.length, 8);
    assert.equal(d.playerProfiles!.players.length, 120);
    for (const game of d.schedule) {
      const home = squadParticipation(d, game.homeSquadId)!;
      const away = squadParticipation(d, game.awaySquadId)!;
      assert.equal(home.competitionId, away.competitionId);
      assert.deepEqual(game.stadiumRef, home.homeStadiumRef);
      assert.equal(gameStadium(d, game.gameId)!.stadiumId, home.homeStadiumRef.stadiumId);
      const geometry = gameStadium(d, game.gameId)!.geometry;
      assert.equal(geometry.fenceCenterMm, d.matchConfig.battedBall.fenceCenterMeters * 1000);
    }
    const secondGeometry = data.stadiums[1]!.geometry.fenceHeightMm;
    data.stadiums[0]!.geometry.fenceHeightMm++;
    assert.equal(data.stadiums[1]!.geometry.fenceHeightMm, secondGeometry);
    assert.equal(
      createLeagueStructureDefinitions(calendar).leagueStructure!.stadiums[0]!.geometry
        .fenceHeightMm,
      secondGeometry,
    );
  }
});

test('大会構造の検査：欠落・重複・異なる年度/階級・球場参照・単位の不正を拒否する', () => {
  const mutations: ((d: WorldDefinitions) => void)[] = [
    (d) => {
      delete d.leagueStructure;
    },
    (d) => {
      d.leagueStructure!.clubs.pop();
    },
    (d) => {
      d.leagueStructure!.squads.pop();
    },
    (d) => {
      d.leagueStructure!.participations.pop();
    },
    (d) => {
      d.leagueStructure!.leagues[1]!.level = 'first';
    },
    (d) => {
      d.leagueStructure!.clubs[0]!.regionId = 'missing';
    },
    (d) => {
      d.leagueStructure!.clubs[0]!.displayName = '別の名前';
    },
    (d) => {
      d.leagueStructure!.squads[0]!.clubId = 'missing';
    },
    (d) => {
      d.leagueStructure!.squads[0]!.level = 'farm';
    },
    (d) => {
      d.leagueStructure!.competitions[0]!.seasonId = 'other-season';
    },
    (d) => {
      d.leagueStructure!.competitions[1]!.competitionId = d.competitionId;
    },
    (d) => {
      d.leagueStructure!.participations[0]!.leagueId = 'missing';
    },
    (d) => {
      d.leagueStructure!.participations[0]!.homeStadiumRef.stadiumId = 'missing';
    },
    (d) => {
      d.leagueStructure!.participations[1] = structuredClone(d.leagueStructure!.participations[0]!);
    },
    (d) => {
      d.leagueStructure!.stadiums[1] = structuredClone(d.leagueStructure!.stadiums[0]!);
    },
    (d) => {
      d.leagueStructure!.stadiums[0]!.capacity = 0;
    },
    (d) => {
      d.leagueStructure!.stadiums[0]!.capacity = 200001;
    },
    (d) => {
      d.leagueStructure!.stadiums[0]!.geometry.fenceHeightMm = 3;
    },
    (d) => {
      d.leagueStructure!.stadiums[0]!.geometry.fenceHeightMm = NaN;
    },
    (d) => {
      Object.assign(d.leagueStructure!.stadiums[0]!, { roofType: 'dome' });
    },
    (d) => {
      Object.assign(d.leagueStructure!.stadiums[0]!, { version: 2 });
    },
    (d) => {
      Object.assign(d.leagueStructure!, { version: 'league-structure-v2' });
    },
    (d) => {
      Object.assign(d.leagueStructure!.clubs[0]!, { popularityMilli: 0 });
    },
    (d) => {
      delete d.schedule[0]!.stadiumRef;
    },
    (d) => {
      d.schedule[0]!.stadiumRef!.stadiumId = 'missing';
    },
    (d) => {
      d.schedule[0]!.stadiumRef = structuredClone(
        d.leagueStructure!.participations.find((p) => p.squadId === d.schedule[0]!.awaySquadId)!
          .homeStadiumRef,
      );
    },
  ];
  const original = createLeagueStructureDefinitions();
  for (const mutate of mutations) {
    const d = structuredClone(original);
    mutate(d);
    assert.throws(() => createLeagueStructureWorld(1, undefined, d));
  }
});

test('球場の保存：編集元の改名後も当時の球場名・版で再開し、日次結果が一致する', async () => {
  const world = advanceWorld(createLeagueStructureWorld(), 25);
  const gameId = world.definitions.schedule[0]!.gameId;
  const original = stadiums.find(
    (s) => s.stadiumId === gameStadium(world.definitions, gameId)!.stadiumId,
  )!;
  const oldName = original.displayName;
  const db = new WorldDatabase('league-structure-save');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    original.displayName = '編集後の球場';
    assert.equal(
      gameStadium(createLeagueStructureDefinitions(), gameId)!.displayName,
      '編集後の球場',
    );
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, world);
    assert.equal(gameStadium(loaded.definitions, gameId)!.displayName, oldName);
    assert.deepEqual(finishDay(loaded), finishDay(world));
  } finally {
    original.displayName = oldName;
    await db.delete();
  }
});

test('旧v16：球場情報を補完せず、同seedの試合・乱数・成績・身体状態を維持する', () => {
  const old = advanceWorld(createPlayerProfileWorld(), 25);
  const current = advanceWorld(createLeagueStructureWorld(), 25);
  assert.deepEqual(current.games, old.games);
  assert.equal(old.definitions.leagueStructure, undefined);
  assert.equal(gameStadium(old.definitions, old.definitions.schedule[0]!.gameId), undefined);
  assert.equal(
    stadiumByRef(old.definitions, { stadiumId: 'aonagi-stadium', version: 1 }),
    undefined,
  );
  const { definitions: _old, ...oldDay } = finishDay(old);
  const { definitions: _new, ...newDay } = finishDay(current);
  assert.deepEqual(newDay, oldDay);
  for (const inject of [
    (d: WorldDefinitions) => {
      d.leagueStructure = current.definitions.leagueStructure;
    },
    (d: WorldDefinitions) => {
      d.schedule[0]!.stadiumRef = current.definitions.schedule[0]!.stadiumRef;
    },
  ]) {
    const broken = structuredClone(old);
    inject(broken.definitions);
    assert.throws(() => validateWorld(broken));
  }
});

test('新規確認：旧プレイ読込中も現行初期データを表示し、独立した現行定義の保存を作成する', async () => {
  const db = new WorldDatabase('league-structure-new-play');
  const old = createPlayerProfileWorld(42);
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(old, 1, 'manual', 0);
    const workspace = new WorldWorkspace(db);
    await workspace.initialize();
    let response = await workspace.handle({ kind: 'query' });
    response = await workspace.handle({
      kind: 'load',
      slot: 'manual',
      commandId: crypto.randomUUID(),
      localWorldId: response.view.localWorldId,
      expectedStateRevision: response.view.revision,
    });
    assert.equal(response.ok, true);
    assert.equal(response.view.definitions.version, 'world-definitions-v16');
    assert.equal(response.view.definitions.leagueStructure, undefined);
    assert.deepEqual(response.newPlayOptions, createNewPlayOptions());
    assert.equal(response.newPlayOptions.annual.startDate, '2026-03-27');
    response.newPlayOptions.short.clubs[0]!.homeStadiumName = '表示側の改変';
    response = await workspace.handle({ kind: 'query' });
    assert.equal(response.newPlayOptions.short.clubs[0]!.homeStadiumName, '星原スタジアム');
    const created = await workspace.handle({
      kind: 'new',
      seed: 42,
      commandId: crypto.randomUUID(),
      localWorldId: response.view.localWorldId,
      expectedStateRevision: response.view.revision,
      controlledSquadId: 'aonagi-first',
    });
    assert.equal(created.ok, true);
    assert.equal(created.view.definitions.version, 'world-definitions-v20');
    assert.equal(created.view.management!.controlledSquadId, 'aonagi-first');
    const saved = (await new DexieWorldStorage(db, created.view.localWorldId).load('auto')).world;
    assert.deepEqual(saved.definitions.leagueStructure, created.view.definitions.leagueStructure);
    assert.deepEqual((await storage.load('manual')).world, old);
  } finally {
    await db.delete();
  }
});
