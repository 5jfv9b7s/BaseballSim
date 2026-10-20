import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createPlayerDevelopmentDefinitions } from '../src/data/world/player-development.ts';
import { createPlayerDevelopmentCatalog } from '../src/data/development/index.ts';
import firstInput from '../src/data/development/hoshihara/player-a-01.json' with { type: 'json' };
import { createTwoLeagueDefinitions } from '../src/data/world/two-leagues.ts';
import { createPlayerProfileDefinitions } from '../src/data/world/player-profiles.ts';
import {
  createPlayerDevelopmentWorld,
  createTwoLeagueWorld,
  advanceWorld,
  completeDay,
  worldPhase,
  validateDefinitions,
} from '../src/world/engine.ts';
import {
  playerBaseAbilities,
  playerDevelopment,
  validatePlayerDevelopmentCatalog,
} from '../src/world/player-development.ts';
import {
  COMMON_ABILITIES,
  ADDITIONAL_ABILITY_CODES,
  EXISTING_ABILITY_CODES,
  FIELD_POSITIONS,
  abilityRank,
} from '../src/players/abilities.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import { exportStoredPlay } from '../src/world/backup-storage.ts';
import { decodeBackup } from '../src/world/backup-package.ts';
import { validateWorld } from '../src/world/validation.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  return completeDay(world, world.currentDate);
}

function withoutDefinitions(world: WorldRecord) {
  const { definitions: _definitions, ...state } = world;
  return state;
}

test('22能力：短期・年間の120人に11既存＋11追加、9位置と独立した特性を保持', () => {
  assert.equal(Object.keys(COMMON_ABILITIES).length, 22);
  assert.equal(EXISTING_ABILITY_CODES.length, 11);
  assert.equal(ADDITIONAL_ABILITY_CODES.length, 11);
  assert.equal(new Set([...EXISTING_ABILITY_CODES, ...ADDITIONAL_ABILITY_CODES]).size, 22);
  for (const calendar of ['short', 'annual'] as const) {
    const definitions = createPlayerDevelopmentDefinitions(calendar);
    const world = createPlayerDevelopmentWorld(1, undefined, definitions);
    validateWorld(world);
    assert.equal(world.version, 'world-prototype-v15');
    assert.equal(definitions.version, 'world-definitions-v19');
    assert.equal(definitions.playerDevelopment!.players.length, 120);
    for (const squad of definitions.squads)
      for (const player of squad.players) {
        const abilities = playerBaseAbilities(definitions, player.playerId)!;
        assert.equal(Object.keys(abilities).length, 22);
        assert.deepEqual(abilities['batting.contactVsRight'], player.batting.contactVsRight);
        assert.deepEqual(abilities['fielding.catching'], player.fielding!.catching);
        const input = playerDevelopment(definitions, player.playerId)!;
        assert.deepEqual(Object.keys(input.positionSkills).sort(), [...FIELD_POSITIONS].sort());
        assert.equal(Object.hasOwn(input.positionSkills, 'DH'), false);
        assert.ok(!Object.hasOwn(input.additionalAbilities, 'physical.stamina'));
        assert.deepEqual(Object.keys(input.growthProfile).sort(), ['ambitionMilli', 'talentMilli']);
        assert.equal(Object.hasOwn(input.pitchingAptitudes, 'ceilingMilli'), false);
      }
    const { version: _a, playerDevelopment: _b, ...legacyProjection } = definitions;
    const { version: _c, ...old } = createTwoLeagueDefinitions(calendar);
    assert.deepEqual(legacyProjection, old);
  }
});

test('22能力：編集ファイルを球団ごと30人に分け、固定IDと内容の対応を検査', () => {
  const catalog = createPlayerDevelopmentCatalog();
  const ids: string[] = [];
  const definitions = createTwoLeagueDefinitions();
  for (const club of ['hoshihara', 'aonagi', 'kohaku', 'asagiri']) {
    const folder = new URL(`../src/data/development/${club}/`, import.meta.url);
    const files = readdirSync(folder).filter((name) => name.endsWith('.json'));
    assert.equal(files.length, 30);
    const squad = definitions.squads.find((s) => s.squadId === club + '-first')!;
    for (const file of files) {
      const input = JSON.parse(readFileSync(new URL(file, folder), 'utf8'));
      assert.equal(file, input.playerId + '.json');
      assert.ok(squad.players.some((p) => p.playerId === input.playerId));
      const expected = catalog.players.find((p) => p.playerId === input.playerId);
      assert.ok(expected);
      assert.deepEqual(input, expected);
      ids.push(input.playerId);
    }
  }
  assert.equal(ids.length, 120);
  assert.equal(new Set(ids).size, 120);
});

test('22能力の境界：不足・余分・重複・不正な上限や単位・固定適性の上限追加を拒否', () => {
  const base = createPlayerDevelopmentDefinitions();
  const mutations: ((catalog: any) => void)[] = [
    (c) => {
      delete c.players[0].additionalAbilities['batting.bunting'];
    },
    (c) => {
      c.players[0].additionalAbilities['batting.contactVsRight'] = {
        valueMilli: 50000,
        ceilingMilli: 110000,
      };
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'].valueMilli = 110001;
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'].ceilingMilli = 120001;
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'].valueMilli = 1.5;
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'].valueMilli = NaN;
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'].valueMilli = Infinity;
    },
    (c) => {
      c.players[0].additionalAbilities['batting.bunting'] = null;
    },
    (c) => {
      delete c.players[0].positionSkills.SS;
    },
    (c) => {
      c.players[0].positionSkills.DH = c.players[0].positionSkills.C;
    },
    (c) => {
      c.players[0].positionSkills.P.familiarity.valueMilli = 120001;
    },
    (c) => {
      c.players[0].positionSkills.P.aptitudeMilli = -1;
    },
    (c) => {
      c.players[0].pitchingAptitudes.starterMilli = 120001;
    },
    (c) => {
      c.players[0].pitchingAptitudes.ceilingMilli = 120000;
    },
    (c) => {
      c.players[0].growthProfile.talentMilli = -1;
    },
    (c) => {
      c.players[0].growthProfile.ceilingMilli = 120000;
    },
    (c) => {
      c.players[0].playerId = c.players[1].playerId;
    },
    (c) => {
      c.players[0].playerId = '__proto__';
    },
    (c) => {
      c.players[0].playerId = 'not-in-roster';
    },
    (c) => {
      c.players.pop();
    },
    (c) => {
      c.source = 'official-data';
    },
  ];
  for (const mutate of mutations) {
    const definitions = structuredClone(base);
    mutate(definitions.playerDevelopment);
    assert.throws(() => validateDefinitions(definitions));
  }
  const missingExisting = structuredClone(base);
  delete missingExisting.squads[0]!.players[0]!.fielding;
  assert.throws(() => validateDefinitions(missingExisting));
  const catalog = createPlayerDevelopmentCatalog();
  const skill = catalog.players[0]!.positionSkills.P;
  skill.aptitudeMilli = 120000;
  skill.familiarity = { valueMilli: 0, ceilingMilli: 10000 };
  catalog.players[0]!.pitchingAptitudes = { starterMilli: 0, relieverMilli: 120000 };
  catalog.players[0]!.growthProfile = { talentMilli: 120000, ambitionMilli: 0 };
  assert.doesNotThrow(() => validatePlayerDevelopmentCatalog(catalog));
});

test('能力評価：表示整数からG〜SSを判定し、境界直前の小数で繰り上げない', () => {
  for (const [value, rank] of [
    [0, 'G'],
    [29999, 'G'],
    [30000, 'F'],
    [39999, 'F'],
    [40000, 'E'],
    [50000, 'D'],
    [60000, 'C'],
    [70000, 'B'],
    [80000, 'A'],
    [89999, 'A'],
    [90000, 'S'],
    [99999, 'S'],
    [100000, 'SS'],
    [120000, 'SS'],
  ] as const)
    assert.equal(abilityRank(value), rank);
  for (const value of [-1, 120001, 1.5, NaN, Infinity]) assert.throws(() => abilityRank(value));
});

test('22能力の読み取り：初期データと返却値を独立させ、既存能力の正本を複製しない', () => {
  const definitions = createPlayerDevelopmentDefinitions();
  const before = structuredClone(definitions);
  const id = definitions.squads[0]!.players[0]!.playerId;
  playerBaseAbilities(definitions, id)!['batting.bunting'].valueMilli = 1;
  playerDevelopment(definitions, id)!.positionSkills.C.aptitudeMilli = 1;
  assert.deepEqual(definitions, before);
  definitions.squads[0]!.players[0]!.batting.contactVsRight.valueMilli = 45678;
  assert.equal(playerBaseAbilities(definitions, id)!['batting.contactVsRight'].valueMilli, 45678);
  assert.notDeepEqual(definitions, createPlayerDevelopmentDefinitions());
  assert.equal(playerBaseAbilities(definitions, 'missing'), undefined);
  assert.equal(playerDevelopment(definitions, 'missing'), undefined);
});

test('旧定義：v18/v16へ追加能力を後付けせず、新旧の入口の混用を拒否', () => {
  for (const definitions of [createTwoLeagueDefinitions(), createPlayerProfileDefinitions()]) {
    const id = definitions.squads[0]!.players[0]!.playerId;
    assert.equal(playerBaseAbilities(definitions, id), undefined);
    assert.equal(playerDevelopment(definitions, id), undefined);
    assert.throws(() => createPlayerDevelopmentWorld(1, undefined, definitions));
    definitions.playerDevelopment = createPlayerDevelopmentCatalog();
    assert.throws(() => validateDefinitions(definitions));
  }
  const missing = createPlayerDevelopmentDefinitions();
  delete missing.playerDevelopment;
  assert.throws(() => validateDefinitions(missing));
  assert.throws(() => createTwoLeagueWorld(1, undefined, createPlayerDevelopmentDefinitions()));
});

test('短期完走：未接続値を変えてもv18の試合・乱数・年度要約を維持', () => {
  for (const seed of [1, 20261021]) {
    const definitions = createPlayerDevelopmentDefinitions();
    for (const input of definitions.playerDevelopment!.players) {
      for (const ability of Object.values(input.additionalAbilities)) ability.valueMilli = 0;
      input.growthProfile = { talentMilli: 120000, ambitionMilli: 0 };
      input.pitchingAptitudes = { starterMilli: 0, relieverMilli: 120000 };
      for (const skill of Object.values(input.positionSkills)) {
        skill.aptitudeMilli = 0;
        skill.familiarity.valueMilli = 0;
      }
    }
    let current: WorldRecord = createPlayerDevelopmentWorld(seed, undefined, definitions);
    let old: WorldRecord = createTwoLeagueWorld(seed);
    while (worldPhase(current) !== 'scheduleComplete') {
      current = finishDay(current);
      old = finishDay(old);
      assert.deepEqual(withoutDefinitions(current), withoutDefinitions(old));
    }
    assert.ok('seasonSummary' in current && current.seasonSummary?.version === 'season-summary-v2');
    assert.ok('farmSummary' in current && current.farmSummary?.version === 'season-summary-v2');
    const before = structuredClone(current);
    for (const input of definitions.playerDevelopment!.players)
      playerBaseAbilities(current.definitions, input.playerId);
    assert.deepEqual(current, before);
    validateWorld(current);
  }
});

test('能力の保存・バックアップ：編集後も当時の値で復元し、旧v18を補完しない', async () => {
  const db = new WorldDatabase('player-development-save');
  const previous = firstInput.additionalAbilities['batting.bunting'].valueMilli;
  try {
    const storage = new DexieWorldStorage(db);
    const world = finishDay(createPlayerDevelopmentWorld(3));
    const before = structuredClone(world);
    await storage.save(world, 1, 'manual', 0);
    firstInput.additionalAbilities['batting.bunting'].valueMilli = previous + 1;
    assert.equal(
      createPlayerDevelopmentCatalog().players[0]!.additionalAbilities['batting.bunting']
        .valueMilli,
      previous + 1,
    );
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, before);
    assert.deepEqual(finishDay(loaded), finishDay(world));
    const backup = await decodeBackup(await exportStoredPlay(db, storage.localWorldId, 'manual'));
    assert.deepEqual(backup.world, before);
    const old = createTwoLeagueWorld(9);
    await storage.save(old, 2, 'manual', 1);
    const restoredOld = (await storage.load('manual')).world;
    assert.equal(restoredOld.definitions.version, 'world-definitions-v18');
    assert.equal(restoredOld.definitions.playerDevelopment, undefined);
    assert.equal(
      playerBaseAbilities(
        restoredOld.definitions,
        restoredOld.definitions.squads[0]!.players[0]!.playerId,
      ),
      undefined,
    );
    assert.deepEqual(restoredOld, old);
  } finally {
    firstInput.additionalAbilities['batting.bunting'].valueMilli = previous;
    db.close();
    await db.delete();
  }
});
