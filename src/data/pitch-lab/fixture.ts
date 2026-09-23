import type {
  Ability,
  Fixture,
  Player,
  PitchRepertoire,
  PrototypeState,
} from '../../engine/types.ts';
import { MODEL } from '../../engine/model.ts';
import { validateCount, validateFixture, validateRng } from '../../engine/validation.ts';

const a = (valueMilli: number): Ability => ({
  valueMilli,
  ceilingMilli: Math.max(valueMilli, 100000),
});
function player(
  playerId: string,
  familyName: string,
  givenName: string,
  battingHand: 'R' | 'L',
  contact: number,
): Player {
  return {
    playerId,
    familyName,
    givenName,
    throwingHand: 'R',
    battingHand,
    batting: {
      contactVsRight: a(contact),
      contactVsLeft: a(contact - 5000),
      plateDiscipline: a(70000),
    },
    swingAggressionMilli: 55000,
  };
}
function repertoire(
  pitchId: string,
  pitchTypeCode: PitchRepertoire['pitchTypeCode'],
  speed: number,
  control: number,
): PitchRepertoire {
  return {
    pitchId,
    playerId: 'player-001',
    pitchTypeCode,
    acquisitionProgressMilli: 100000,
    control: a(control),
    repeatability: a(75000),
    velocity: { typicalCentiKph: speed, maxCentiKph: speed + 500, spreadCentiKph: 400 },
  };
}
/** 完全架空。1球検証用の投手・捕手・打者だけ。正式な9人名簿ではない。 */
export const FIXTURE: Fixture = {
  initialDatasetVersion: 'fictional-pitch-fixture-v1',
  clubs: [
    { clubId: 'club-001', name: '青凪ハーバーズ', playerIds: ['player-001', 'player-002'] },
    { clubId: 'club-002', name: '星原フォックス', playerIds: ['player-003'] },
  ],
  players: [
    player('player-001', '汐見', '航', 'R', 35000),
    player('player-002', '瀬川', '律', 'R', 60000),
    player('player-003', '星野', '悠', 'L', 80000),
  ],
  pitches: [
    repertoire('pitch-001', 'fastball', 14800, 80000),
    repertoire('pitch-002', 'slider', 13500, 70000),
    repertoire('pitch-003', 'fork', 13800, 60000),
  ],
  matchup: { pitcherId: 'player-001', catcherId: 'player-002', batterId: 'player-003' },
};

export function createInitialState(
  seed = 20260923,
  count = { balls: 0, strikes: 0 },
): PrototypeState {
  validateFixture(FIXTURE);
  validateCount(count);
  const rng: PrototypeState['rng'] = {
    streamId: 'game-001:attempt:1',
    algorithmVersion: 'xorshift32-v1',
    fullState: { word: seed },
    drawCount: 0,
  };
  validateRng(rng);
  return {
    kind: 'pitch-lab-v1',
    gameId: 'game-001',
    attemptNo: 1,
    activeAppearanceId: 'appearance-001',
    phase: 'readyForPitch',
    count: { ...count },
    nextEventSeq: 1,
    rng,
    simulationVersion: MODEL.version,
    rulesetVersion: MODEL.rulesetVersion,
    initialDatasetVersion: FIXTURE.initialDatasetVersion,
  };
}
