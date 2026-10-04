import type { TeamSide } from './types.ts';

export interface BullpenConfig {
  version: 'auto-bullpen-v1';
  /** 現在投手の交代基準の何球前から準備候補を探すか。 */
  leadPitches: number;
  /** 自チームの守備中に実際に投じられた球数。現実の時間ではない。 */
  requiredPitches: number;
}

export interface BullpenPolicySnapshot {
  config: BullpenConfig;
  teams: Record<TeamSide, { enabled: boolean }>;
}

export interface BullpenEntry {
  phase: 'idle' | 'warming' | 'ready';
  progressPitches: number;
  startOrder: number | null;
}

export interface BullpenState {
  version: 'auto-bullpen-v1';
  nextStartOrder: number;
  teams: Record<TeamSide, { delegated: boolean; players: Record<string, BullpenEntry> }>;
}

export interface BullpenAction {
  side: TeamSide;
  playerId: string;
  kind: 'started' | 'ready' | 'cancelled' | 'entered';
  progressPitches: number;
  startOrder: number;
  reason: string;
}
