import type { CommonAbilityCode, FieldPosition } from './abilities.ts';
import type { Ability, PitchRepertoire } from '../engine/types.ts';
import type { PitchDelivery } from '../engine/pitch-profile-types.ts';

export interface CandidateAbility extends Ability {
  status: 'proposed' | 'generated-proposal-not-calibrated';
  candidateSource: string;
  candidateKind:
    | 'existing-statistical-proposal'
    | 'fictional-completion'
    | 'generated-proposal'
    | 'reference-guided-completion';
  ceilingCandidateSource: string;
  generationVersion?: string;
  ruleVersion?: string;
  confidence?: 'low' | 'medium';
}
export interface CandidatePitch extends Omit<PitchRepertoire, 'delivery' | 'velocity'> {
  delivery: PitchDelivery;
  velocity: PitchRepertoire['velocity'] & { maxCeilingCentiKph: number; provenance: string };
  inputCoordinateConvention: 'right-handed-reference';
  acquiredOn: null;
  selectionWeight: number;
  /** 元資料時点の接続状況。プレビュー対応と区別して保全する。 */
  engineSupport: 'profile-required' | 'supported-profile';
  requiresRarePitchReview: boolean;
}
export interface CandidatePlayer {
  playerId: string;
  profile: {
    playerId: string;
    familyName: string;
    givenName: string;
    displayName: string | null;
    birthDate: string;
    birthplace: { countryCode: string; regionId: string | null };
    throwingHand: 'R' | 'L';
    battingHand: 'R' | 'L' | 'S';
    heightMm: number;
    weightGrams: number;
    positionGroup: 'P' | 'C' | 'IF' | 'OF';
    primaryPosition: FieldPosition | 'DH' | null;
    careerStage: 'active';
    generationBatchId: string;
    profileStatus: 'draft-primary-position-and-career-pending';
    foreignPlayerEligibility: null;
  };
  primaryPositionCandidate: {
    positionCode: FieldPosition | 'DH';
    basis: string;
    games: number;
    level: 'first' | 'farm';
    status: 'proposed-role-not-aptitude' | 'proposed-lineup-role-not-defensive-position';
  } | null;
  commonAbilities: Record<CommonAbilityCode, CandidateAbility>;
  positionSkills: { positionCode: FieldPosition; aptitudeMilli: number; familiarity: Ability }[];
  pitchingAptitudes: { starterMilli: number; relieverMilli: number };
  growthProfile: { talentMilli: number; ambitionMilli: number };
  pitchRepertoires: CandidatePitch[];
  blockers: string[];
  readyForGameImport: false;
}
export interface CandidateProjection {
  datasetVersion: string;
  status: 'review-projection-not-runtime-input';
  sourceDraft: 'growthCompletionDraft';
  players: CandidatePlayer[];
  readyForGameImport: false;
}
export interface CandidateDataset extends CandidateProjection {
  formatVersion: 'initial-candidate-package-v1';
  asOfDate: string;
  club: { clubId: string; displayName: null; regionLabel: string; nameStatus: 'undecided' };
  sourceHashes: { projection: string; locations: string; physicsRule: string };
  locations: {
    countries: { countryCode: string; name: string }[];
    regions: { regionId: string; countryCode: string; name: string }[];
  };
}
