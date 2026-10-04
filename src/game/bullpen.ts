import { ensure, integer } from '../engine/validation.ts';
import { selectReliever } from './relief.ts';
import type { GameFixture, GameState, GameEvent, TeamSide } from './types.ts';
import type { BullpenConfig, BullpenState, BullpenAction, BullpenEntry } from './bullpen-types.ts';

export function validateBullpenConfig(config: BullpenConfig): void {
  ensure(config?.version === 'auto-bullpen-v1', 'ブルペン準備のモデル版が不正です');
  integer(config.leadPitches, 0, 200, '準備開始の先行球数');
  integer(config.requiredPitches, 1, 100, '準備完了までの守備投球数');
}

export function validateBullpenFixture(fixture: GameFixture): void {
  if (!fixture.bullpenPolicy) return;
  ensure(fixture.reliefPolicy, 'ブルペン準備には条件付き救援が必要です');
  validateBullpenConfig(fixture.bullpenPolicy.config);
  for (const side of ['away', 'home'] as const)
    ensure(
      typeof fixture.bullpenPolicy.teams?.[side]?.enabled === 'boolean',
      '両軍の準備方針が必要です',
    );
}

export function initialBullpen(fixture: GameFixture): BullpenState {
  const team = (side: TeamSide) => ({
    delegated: fixture.bullpenPolicy!.teams[side].enabled,
    players: Object.fromEntries(
      fixture.teams[side].pitcherIds.slice(1).map((id) => [
        id,
        {
          phase: 'idle' as const,
          progressPitches: 0,
          startOrder: null,
        },
      ]),
    ),
  });
  return {
    version: 'auto-bullpen-v1',
    nextStartOrder: 1,
    teams: { away: team('away'), home: team('home') },
  };
}

function action(
  side: TeamSide,
  playerId: string,
  entry: BullpenEntry,
  kind: BullpenAction['kind'],
  reason: string,
): BullpenAction {
  return {
    side,
    playerId,
    kind,
    progressPitches: entry.progressPitches,
    startOrder: entry.startOrder!,
    reason,
  };
}

function reset(entry: BullpenEntry): void {
  entry.phase = 'idle';
  entry.progressPitches = 0;
  // 最後の開始順は履歴として残す。再準備時に新しい順を割り当てる。
}

/** 守備中だけ自動開始・条件外の中止を判定する。一軍・二軍・CPUで同じ規則。 */
export function prepareBullpen(
  state: GameState,
  fixture: GameFixture,
  side: TeamSide,
  threshold: number,
): BullpenAction[] {
  if (!fixture.bullpenPolicy?.teams[side].enabled) return [];
  const bullpen = state.bullpen!;
  const entries = bullpen.teams[side].players;
  const decision = selectReliever(state, fixture, side, false);
  const actions: BullpenAction[] = [];
  for (const [id, entry] of Object.entries(entries)) {
    if (entry.phase !== 'idle' && !decision.candidates.find((c) => c.playerId === id)?.eligible) {
      actions.push(
        action(side, id, entry, 'cancelled', '回・点差・登板資格が条件外になったため準備中止'),
      );
      reset(entry);
    }
  }
  const currentId = fixture.teams[side].pitcherIds[state.pitcherIndex[side]]!;
  const startAt = Math.max(0, threshold - fixture.bullpenPolicy.config.leadPitches);
  if (
    state.pitcherPitchCounts[currentId]! >= startAt &&
    decision.selectedId &&
    !Object.values(entries).some((e) => e.phase !== 'idle')
  ) {
    const entry = entries[decision.selectedId]!;
    entry.phase = 'warming';
    entry.progressPitches = 0;
    entry.startOrder = bullpen.nextStartOrder++;
    actions.push(
      action(side, decision.selectedId, entry, 'started', '球数目安と救援条件により自動準備を開始'),
    );
  }
  return actions;
}

/** 準備は実投球だけで進める。交代イベントや表示・保存では進まない。 */
export function finishBullpenEvent(
  state: GameState,
  fixture: GameFixture,
  event: GameEvent,
  defense: TeamSide,
  actions: BullpenAction[],
): void {
  if (!fixture.bullpenPolicy) return;
  if (event.pitch && fixture.bullpenPolicy.teams[defense].enabled) {
    for (const [id, entry] of Object.entries(state.bullpen!.teams[defense].players)) {
      if (entry.phase !== 'warming') continue;
      entry.progressPitches++;
      if (entry.progressPitches >= fixture.bullpenPolicy.config.requiredPitches) {
        entry.phase = 'ready';
        actions.push(action(defense, id, entry, 'ready', '必要な守備投球数に達して準備完了'));
      }
    }
  }
  if (event.substitution && fixture.bullpenPolicy.teams[defense].enabled) {
    const id = event.substitution.inPlayerId;
    const entry = state.bullpen!.teams[defense].players[id]!;
    ensure(entry.phase === 'ready', '準備未完了の救援投手を登板させることはできません');
    actions.push(action(defense, id, entry, 'entered', '準備完了後、球数基準と救援条件により登板'));
    reset(entry);
  }
  if (state.phase === 'gameComplete' || state.phase === 'aborted') {
    for (const side of ['away', 'home'] as const)
      for (const [id, entry] of Object.entries(state.bullpen!.teams[side].players)) {
        if (entry.phase === 'idle') continue;
        actions.push(
          action(side, id, entry, 'cancelled', '試合終了・停止のため準備終了（負荷は保持）'),
        );
        reset(entry);
      }
  }
  if (actions.length) event.bullpenActions = actions;
}
