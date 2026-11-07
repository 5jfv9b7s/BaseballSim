import assert from 'node:assert/strict';
import test from 'node:test';
import { createIndividualPitchFixture } from '../src/data/datasets/individual-pitches.ts';
import { validateFixture } from '../src/engine/validation.ts';

function pitchFixture() {
  const fixture = createIndividualPitchFixture();
  return {
    ...fixture,
    matchup: {
      pitcherId: fixture.teams.away.pitcherIds[0]!,
      catcherId: fixture.teams.away.lineup.find((slot) => slot.position === 'C')!.playerId,
      batterId: fixture.teams.home.lineup[0]!.playerId,
    },
  };
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
}

test('固定名簿：データが固定済みでも新しい投打捕の不正参照を毎回拒否する', () => {
  const fixture = pitchFixture();
  freeze(fixture);
  validateFixture(fixture);
  assert.throws(() =>
    validateFixture({
      ...fixture,
      matchup: { ...fixture.matchup, batterId: fixture.matchup.pitcherId },
    }),
  );
  assert.doesNotThrow(() => validateFixture(fixture));
});

test('固定名簿：浅い凍結は再利用せず、内側の能力変更を検出する', () => {
  const fixture = pitchFixture();
  Object.freeze(fixture.players);
  validateFixture(fixture);
  fixture.players[0]!.batting.contactVsRight.valueMilli = -1;
  assert.throws(() => validateFixture(fixture), /能力/);
});

test('固定名簿：同じ選手配列でも持ち球・球種設定の差し替えを検出する', () => {
  const fixture = pitchFixture();
  freeze(fixture);
  validateFixture(fixture);
  const pitches = structuredClone(fixture.pitches);
  pitches[0]!.playerId = 'unknown-pitcher';
  freeze(pitches);
  assert.throws(() => validateFixture({ ...fixture, pitches }), /所有者/);
  const pitchProfiles = structuredClone(fixture.pitchProfiles!);
  pitchProfiles.profiles[0]!.selection.baseWeight = 0;
  freeze(pitchProfiles);
  assert.throws(() => validateFixture({ ...fixture, pitchProfiles }), /重み/);
});

test('固定名簿：複製と凍結済みgetterの変化を検査済みと誤認しない', () => {
  const fixture = pitchFixture();
  freeze(fixture);
  validateFixture(fixture);
  const copy = structuredClone(fixture);
  validateFixture(copy);
  copy.players[0]!.batting.contactVsRight.valueMilli = -1;
  assert.throws(() => validateFixture(copy), /能力/);

  const accessor = pitchFixture();
  const ability = accessor.players[0]!.batting.contactVsRight;
  let value = ability.valueMilli;
  Object.defineProperty(ability, 'valueMilli', { enumerable: true, get: () => value });
  freeze(accessor);
  validateFixture(accessor);
  value = -1;
  assert.throws(() => validateFixture(accessor), /能力/);
});
