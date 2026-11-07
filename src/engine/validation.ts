import { validateDelivery, validatePitchProfiles } from './pitch-profile-validation.ts';
import type { Ability, Count, Fixture, PrototypeState, RngState } from './types.ts';
import { MODEL } from './model.ts';

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function integer(value: number, min: number, max: number, name: string): void {
  ensure(
    Number.isSafeInteger(value) && value >= min && value <= max,
    `${name}: ${min}～${max}の整数が必要です`,
  );
}
export function id(value: string): void {
  ensure(typeof value === 'string' && value.trim().length > 0, '空でないIDが必要です');
}
export function validateCount(count: Count): void {
  integer(count.balls, 0, 3, 'balls');
  integer(count.strikes, 0, 2, 'strikes');
}
export function validateRng(rng: RngState): void {
  id(rng.streamId);
  ensure(rng.algorithmVersion === 'xorshift32-v1', '未対応の乱数版です');
  integer(rng.fullState.word, 1, 0xffffffff, '乱数状態');
  integer(rng.drawCount, 0, Number.MAX_SAFE_INTEGER - 10, '乱数消費数');
}
function ability(a: Ability): void {
  integer(a.valueMilli, 0, 120000, '能力');
  integer(a.ceilingMilli, a.valueMilli, 120000, '能力上限');
}
function unique(values: string[]): void {
  values.forEach(id);
  ensure(new Set(values).size === values.length, 'IDが重複しています');
}
type FixtureData = Pick<
  Fixture,
  'initialDatasetVersion' | 'clubs' | 'players' | 'pitches' | 'pitchProfiles'
>;

// 深く固定されたデータだけを記憶する。可変の入力や読込後の複製は必ず再検査する。
const verifiedFixtureData = new WeakMap<Fixture['players'], FixtureData>();
function deeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null)
    return false;
  // 凍結済みでもgetterの返り値は変わり得るため、データプロパティだけを記憶する。
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => 'value' in descriptor && deeplyFrozen(descriptor.value, seen),
  );
}

function sameFixtureData(a: FixtureData | undefined, b: FixtureData): boolean {
  return (
    !!a &&
    a.initialDatasetVersion === b.initialDatasetVersion &&
    a.clubs === b.clubs &&
    a.pitches === b.pitches &&
    a.pitchProfiles === b.pitchProfiles
  );
}

function validateFixtureData(fixture: Fixture): void {
  id(fixture.initialDatasetVersion);
  ensure(fixture.clubs.length === 2, '試作は架空2球団が必要です');
  unique(fixture.clubs.map((c) => c.clubId));
  unique(fixture.players.map((p) => p.playerId));
  unique(fixture.pitches.map((p) => p.pitchId));
  const membership = fixture.clubs.flatMap((c) => c.playerIds);
  unique(membership);
  ensure(membership.length === fixture.players.length, '球団と選手の所属数が一致しません');
  for (const player of fixture.players) {
    ensure(membership.includes(player.playerId), '所属していない選手です');
    id(player.familyName);
    id(player.givenName);
    ensure(
      ['R', 'L'].includes(player.throwingHand) && ['R', 'L', 'S'].includes(player.battingHand),
      '左右が不正です',
    );
    Object.values(player.batting).forEach(ability);
    // 必須項目欠損も検出する。
    ability(player.batting.contactVsRight);
    ability(player.batting.contactVsLeft);
    ability(player.batting.plateDiscipline);
    integer(player.swingAggressionMilli, 0, 100000, '積極性');
  }
  if (fixture.pitchProfiles) validatePitchProfiles(fixture.pitchProfiles);
  for (const pitch of fixture.pitches) {
    ensure(
      fixture.players.some((p) => p.playerId === pitch.playerId),
      '持ち球の所有者が存在しません',
    );
    ensure(
      fixture.pitchProfiles
        ? fixture.pitchProfiles.profiles.some((p) => p.code === pitch.pitchTypeCode)
        : Object.hasOwn(MODEL.baseWeights, pitch.pitchTypeCode),
      '未対応の球種です',
    );
    if (pitch.delivery) {
      ensure(fixture.pitchProfiles, '旧モデルへ回転入力は指定できません');
      validateDelivery(pitch.delivery);
    }
    integer(pitch.acquisitionProgressMilli, 0, 100000, '習得進度');
    ability(pitch.control);
    ability(pitch.repeatability);
    integer(pitch.velocity.typicalCentiKph, 5000, 18000, '中心球速');
    integer(pitch.velocity.maxCentiKph, pitch.velocity.typicalCentiKph, 20000, 'MAX球速');
    integer(pitch.velocity.spreadCentiKph, 0, 2000, '球速幅');
  }
}

export function validateFixture(fixture: Fixture): void {
  const verified = verifiedFixtureData.get(fixture.players);
  const reuse = sameFixtureData(verified, fixture);
  if (!reuse) validateFixtureData(fixture);
  // 投打捕の組み合わせは毎球変わる。固定データの検査済み判定に含めない。
  const actors = Object.values(fixture.matchup);
  unique(actors);
  ensure(
    actors.every((actor) => fixture.players.some((p) => p.playerId === actor)),
    '投打捕の参照が不正です',
  );
  const defense = fixture.clubs.find((c) => c.playerIds.includes(fixture.matchup.pitcherId));
  ensure(
    defense && defense.playerIds.includes(fixture.matchup.catcherId),
    '投手と捕手の所属が異なります',
  );
  ensure(
    !defense.playerIds.includes(fixture.matchup.batterId),
    '打者は相手球団である必要があります',
  );
  ensure(
    fixture.pitches.some(
      (p) => p.playerId === fixture.matchup.pitcherId && p.acquisitionProgressMilli === 100000,
    ),
    '使用可能な持ち球がありません',
  );
  if (
    !reuse &&
    Object.isFrozen(fixture.players) &&
    deeplyFrozen(fixture.players) &&
    deeplyFrozen(fixture.clubs) &&
    deeplyFrozen(fixture.pitches) &&
    deeplyFrozen(fixture.pitchProfiles)
  ) {
    verifiedFixtureData.set(fixture.players, {
      initialDatasetVersion: fixture.initialDatasetVersion,
      players: fixture.players,
      clubs: fixture.clubs,
      pitches: fixture.pitches,
      pitchProfiles: fixture.pitchProfiles,
    });
  }
}

export function validateState(state: PrototypeState, fixture: Fixture): void {
  ensure(state.kind === 'pitch-lab-v1', '全世界セーブと1球試作の状態は互換ではありません');
  id(state.gameId);
  id(state.activeAppearanceId);
  ensure(state.attemptNo === 1, '未対応の開催試行です');
  ensure(
    state.phase === 'readyForPitch' || state.phase === 'prototypeStopped',
    '不正な進行状態です',
  );
  validateCount(state.count);
  validateRng(state.rng);
  integer(state.nextEventSeq, 1, Number.MAX_SAFE_INTEGER - 1, 'eventSeq');
  ensure(
    state.simulationVersion === MODEL.version && state.rulesetVersion === MODEL.rulesetVersion,
    '未対応のモデル・規則版です',
  );
  ensure(
    state.initialDatasetVersion === fixture.initialDatasetVersion,
    '初期データ版が一致しません',
  );
  ensure(state.rng.streamId === `${state.gameId}:attempt:1`, '乱数ストリームが別の試合です');
}
