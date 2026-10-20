import { createInitial2026PitchProfiles } from '../data/pitch-types/initial-2026.ts';
import { createMatchConfig } from '../game/config.ts';
import { MODEL } from '../engine/model.ts';
import { simulateProfilePitch } from '../engine/pitch-profile.ts';
import { ensure, integer, validateCount, validateFixture } from '../engine/validation.ts';
import { initialCandidatePreviewConfig } from '../../config/initial-candidate-preview.ts';
import type { CandidateDataset, CandidatePitch, CandidatePlayer } from './types.ts';
import type { Fixture, Player, PitchRepertoire, PrototypeState, Count } from '../engine/types.ts';

export interface CandidatePreviewRequest {
  pitcherId: string;
  pitchId: string;
  batterId: string;
  seed: number;
  count: Count;
}
function labPlayer(p: CandidatePlayer): Player {
  const ability = (
    code: 'batting.contactVsRight' | 'batting.contactVsLeft' | 'batting.plateDiscipline',
  ) => {
    const a = p.commonAbilities[code];
    return { valueMilli: a.valueMilli, ceilingMilli: a.ceilingMilli };
  };
  return {
    playerId: p.playerId,
    familyName: p.profile.familyName,
    givenName: p.profile.givenName,
    throwingHand: p.profile.throwingHand,
    battingHand: p.profile.battingHand,
    batting: {
      contactVsRight: ability('batting.contactVsRight'),
      contactVsLeft: ability('batting.contactVsLeft'),
      plateDiscipline: ability('batting.plateDiscipline'),
    },
    swingAggressionMilli: initialCandidatePreviewConfig.swingAggressionMilli,
  };
}

/** 元の候補にある由来・未決定状態・配球案は残し、単球の必要項目だけを明示して射影する。 */
export function previewRepertoire(q: CandidatePitch): PitchRepertoire {
  return {
    pitchId: q.pitchId,
    playerId: q.playerId,
    pitchTypeCode: q.pitchTypeCode,
    control: { ...q.control },
    repeatability: { ...q.repeatability },
    acquisitionProgressMilli: q.acquisitionProgressMilli,
    velocity: {
      typicalCentiKph: q.velocity.typicalCentiKph,
      maxCentiKph: q.velocity.maxCentiKph,
      spreadCentiKph: q.velocity.spreadCentiKph,
    },
    delivery: structuredClone(q.delivery),
  };
}

/** 現行v11式の抽選範囲を表示する診断。MAXへ届かせるための逆補正はしない。 */
export function candidateVelocityRange(q: CandidatePitch) {
  const config = createMatchConfig().pitch;
  const width =
    q.velocity.spreadCentiKph *
    (1 - (config.velocityRepeatabilityReduction * q.repeatability.valueMilli) / 120000);
  const lowDraw = 1 / 0x100000000,
    highDraw = 0xffffffff / 0x100000000;
  const speed = (draw: number) =>
    Math.round(
      Math.min(
        q.velocity.maxCentiKph,
        Math.max(5000, q.velocity.typicalCentiKph + (2 * draw - 1) * width),
      ),
    );
  return {
    minCentiKph: speed(lowDraw),
    maxCentiKph: speed(highDraw),
    reachesBasicMax: speed(highDraw) === q.velocity.maxCentiKph,
  };
}

export function previewCandidatePitch(dataset: CandidateDataset, request: CandidatePreviewRequest) {
  integer(request.seed, 1, 0xffffffff, '乱数seed');
  validateCount(request.count);
  const pitcher = dataset.players.find((p) => p.playerId === request.pitcherId);
  const batter = dataset.players.find((p) => p.playerId === request.batterId);
  ensure(pitcher && batter && pitcher !== batter, '異なる投手・打者を選んでください');
  const pitch = pitcher.pitchRepertoires.find((q) => q.pitchId === request.pitchId);
  ensure(
    pitch && pitch.acquisitionProgressMilli === 100000,
    '投手が持つ習得済み候補球を指定してください',
  );
  const catcher = [...dataset.players]
    .sort((a, b) => (a.playerId < b.playerId ? -1 : 1))
    .find(
      (p) =>
        p.profile.positionGroup === 'C' &&
        p.playerId !== batter.playerId &&
        p.playerId !== pitcher.playerId,
    );
  ensure(catcher, '検証用の捕手候補が必要です');
  const fixture: Fixture = {
    initialDatasetVersion: initialCandidatePreviewConfig.version + ':' + dataset.datasetVersion,
    pitchProfiles: createInitial2026PitchProfiles(),
    // 同一球団資料の投打を計算する検証用グループ。正式な所属・試合日程ではない。
    clubs: [
      {
        clubId: 'candidate-preview-defense',
        name: '検証用投手側',
        playerIds: [pitcher.playerId, catcher.playerId],
      },
      { clubId: 'candidate-preview-attack', name: '検証用打者側', playerIds: [batter.playerId] },
    ],
    players: [labPlayer(pitcher), labPlayer(batter), labPlayer(catcher)],
    pitches: [previewRepertoire(pitch)],
    matchup: {
      pitcherId: pitcher.playerId,
      batterId: batter.playerId,
      catcherId: catcher.playerId,
    },
  };
  validateFixture(fixture);
  const gameId = 'initial-candidate-pitch-preview';
  const state: PrototypeState = {
    kind: 'pitch-lab-v1',
    gameId,
    attemptNo: 1,
    activeAppearanceId: 'candidate-preview-appearance',
    phase: 'readyForPitch',
    count: { ...request.count },
    nextEventSeq: 1,
    rng: {
      streamId: gameId + ':attempt:1',
      algorithmVersion: 'xorshift32-v1',
      fullState: { word: request.seed },
      drawCount: 0,
    },
    simulationVersion: MODEL.version,
    rulesetVersion: MODEL.rulesetVersion,
    initialDatasetVersion: fixture.initialDatasetVersion,
  };
  const config = createMatchConfig().pitch;
  const step = simulateProfilePitch(state, fixture, 'candidate-preview-single-pitch', config);
  return {
    version: initialCandidatePreviewConfig.version,
    request: structuredClone(request),
    fixture,
    config,
    step,
    velocityRange: candidateVelocityRange(pitch),
  };
}
export type CandidatePitchPreview = ReturnType<typeof previewCandidatePitch>;
