import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerProfileDefinitions } from '../src/data/world/player-profiles.ts';
import { profiles as hoshihara } from '../src/data/profiles/hoshihara.ts';
import {
  createPlayerProfileWorld,
  createPitchProfileWorld,
  advanceWorld,
  completeDay,
  worldPhase,
} from '../src/world/engine.ts';
import {
  playerAge,
  playerProfile,
  profileBirthplace,
  validatePlayerProfiles,
} from '../src/world/player-profiles.ts';
import { validateWorld } from '../src/world/validation.ts';
import { WorldDatabase, DexieWorldStorage } from '../src/world/dexie-storage.ts';
import type { PlayerProfile } from '../src/world/player-profile-types.ts';
import type { WorldRecord } from '../src/world/types.ts';

function finishDay(world: WorldRecord): WorldRecord {
  while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
  assert.equal(worldPhase(world), 'readyToComplete');
  return completeDay(world, world.currentDate);
}

test('年齢：ゲーム内の誕生日・年越し・閏年で満年齢を導出し、不明値を0歳にしない', () => {
  assert.equal(playerAge('2000-09-24', '2026-09-23'), 25);
  assert.equal(playerAge('2000-09-24', '2026-09-24'), 26);
  assert.equal(playerAge('2000-09-24', '2027-01-01'), 26);
  assert.equal(playerAge('2000-02-29', '2024-02-29'), 24);
  assert.equal(playerAge('2000-02-29', '2025-02-28'), 24);
  assert.equal(playerAge('2000-02-29', '2025-03-01'), 25);
  assert.equal(playerAge('2026-09-24', '2026-09-24'), 0);
  for (const [birth, date] of [
    ['2026-09-25', '2026-09-24'],
    ['2000-02-30', '2026-09-24'],
    ['2001-02-29', '2026-09-24'],
    ['', '2026-09-24'],
    ['2000-01-01', '2026-13-01'],
  ]) {
    assert.equal(playerAge(birth!, date!), null);
  }
});

test('プロフィール：短期・年間の全120人を網羅し、開始データを独立した保存定義にする', () => {
  for (const calendar of ['short', 'annual'] as const) {
    const definitions = createPlayerProfileDefinitions(calendar);
    const world = createPlayerProfileWorld(20260924, undefined, definitions);
    validateWorld(world);
    const catalog = world.definitions.playerProfiles!;
    assert.equal(world.version, 'world-prototype-v15');
    assert.equal(world.definitions.version, 'world-definitions-v16');
    assert.equal(catalog.players.length, 120);
    assert.equal(new Set(catalog.players.map((p) => p.playerId)).size, 120);
    for (const squad of world.definitions.squads) {
      for (const player of squad.players) {
        const profile = playerProfile(world.definitions, player.playerId)!;
        assert.ok(profile);
        assert.ok(playerAge(profile.birthDate, world.currentDate)! > 0);
        assert.match(profileBirthplace(world.definitions, profile), /^日本・/);
      }
    }
    catalog.players[0]!.birthDate = '1990-01-01';
    catalog.countries[0]!.name = '保存内の国名';
    assert.notEqual(
      createPlayerProfileDefinitions(calendar).playerProfiles!.players[0]!.birthDate,
      '1990-01-01',
    );
    assert.equal(
      createPlayerProfileDefinitions(calendar).playerProfiles!.countries[0]!.name,
      '日本',
    );
  }
});

test('プロフィールの検査：欠落・重複・参照・日付・単位・未知項目を拒否する', () => {
  const original = createPlayerProfileDefinitions();
  const mutations: ((p: PlayerProfile) => void)[] = [
    (p) => {
      p.playerId = 'missing';
    },
    (p) => {
      p.birthDate = '2001-02-29';
    },
    (p) => {
      p.birthDate = '2027-01-01';
    },
    (p) => {
      p.birthDate = '1800-01-01';
    },
    (p) => {
      p.birthplace.countryCode = 'ZZ';
    },
    (p) => {
      p.birthplace.regionId = null;
    },
    (p) => {
      p.birthplace.regionId = 'missing';
    },
    (p) => {
      p.birthplace.countryCode = 'US';
    },
    (p) => {
      p.heightMm = 1700.5;
    },
    (p) => {
      p.weightGrams = 0;
    },
    (p) => {
      p.heightMm = NaN;
    },
    (p) => {
      p.displayName = ' ';
    },
    (p) => {
      p.firstProYear = 2027;
    },
    (p) => {
      p.firstProYear = 1800;
    },
    (p) => {
      p.generationBatchId = '__proto__';
    },
    (p) => {
      p.careerStage = 'retired';
    },
    (p) => {
      Object.assign(p, { primaryPosition: 'XX' });
    },
    (p) => {
      Object.assign(p, { background: 'toString' });
    },
    (p) => {
      Object.assign(p, { age: 30 });
    },
    (p) => {
      Reflect.deleteProperty(p, 'displayName');
    },
  ];
  for (const mutate of mutations) {
    const definitions = structuredClone(original);
    mutate(definitions.playerProfiles!.players[0]!);
    assert.throws(() => validatePlayerProfiles(definitions));
  }
  for (const kind of ['missing', 'duplicate', 'country', 'region', 'version', 'absent'] as const) {
    const definitions = structuredClone(original);
    const catalog = definitions.playerProfiles!;
    if (kind === 'missing') catalog.players.pop();
    if (kind === 'duplicate') catalog.players[1] = structuredClone(catalog.players[0]!);
    if (kind === 'country') catalog.countries.push(structuredClone(catalog.countries[0]!));
    if (kind === 'region') catalog.regions[0]!.countryCode = 'ZZ';
    if (kind === 'version') Object.assign(catalog, { version: 'player-profiles-v2' });
    if (kind === 'absent') delete definitions.playerProfiles;
    assert.throws(() => createPlayerProfileWorld(1, undefined, definitions));
  }
  // 海外出生の地域未記録は許可する。外国人枠の資格を出生地から変更しない。
  const overseas = structuredClone(original);
  overseas.playerProfiles!.players[0]!.birthplace = { countryCode: 'US', regionId: null };
  const world = createPlayerProfileWorld(1, undefined, overseas);
  assert.deepEqual(world.registration, createPlayerProfileWorld(1).registration);
});

test('プロフィールの保存：ソース編集後も保存内の値を再開し、続行結果を維持する', async () => {
  const world = advanceWorld(createPlayerProfileWorld(), 25);
  const db = new WorldDatabase('player-profiles-roundtrip');
  const original = hoshihara[0]!.birthDate;
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(world, 1, 'manual', 0);
    hoshihara[0]!.birthDate = '1990-01-01';
    assert.equal(
      createPlayerProfileDefinitions().playerProfiles!.players[0]!.birthDate,
      '1990-01-01',
    );
    const loaded = (await storage.load('manual')).world;
    assert.deepEqual(loaded, world);
    assert.equal(loaded.definitions.playerProfiles!.players[0]!.birthDate, original);
    assert.deepEqual(finishDay(loaded), finishDay(world));
  } finally {
    hoshihara[0]!.birthDate = original;
    await db.delete();
  }
});

test('旧定義v15：プロフィールを補完せず、同じseedの試合・乱数・日次結果を維持する', async () => {
  const old = advanceWorld(createPitchProfileWorld(), 25);
  const current = advanceWorld(createPlayerProfileWorld(), 25);
  assert.equal(old.definitions.version, 'world-definitions-v15');
  assert.equal(old.definitions.playerProfiles, undefined);
  assert.equal(
    playerProfile(old.definitions, old.definitions.squads[0]!.players[0]!.playerId),
    undefined,
  );
  assert.deepEqual(current.games, old.games);
  const oldDay = finishDay(old),
    currentDay = finishDay(current);
  // 追加された保存定義以外に進行への差がない。
  const { definitions: _oldDefinitions, ...oldState } = oldDay;
  const { definitions: _newDefinitions, ...currentState } = currentDay;
  assert.deepEqual(currentState, oldState);
  const broken = structuredClone(old);
  broken.definitions.playerProfiles = createPlayerProfileDefinitions().playerProfiles;
  assert.throws(() => validateWorld(broken));
  const db = new WorldDatabase('player-profiles-legacy');
  try {
    const storage = new DexieWorldStorage(db);
    await storage.save(old, 1, 'manual', 0);
    const loaded = (await storage.load('manual')).world;
    assert.equal(loaded.definitions.playerProfiles, undefined);
    assert.deepEqual(finishDay(loaded), oldDay);
  } finally {
    await db.delete();
  }
});
