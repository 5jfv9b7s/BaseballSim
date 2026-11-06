import { gameFixture, beginCommand, advanceCommand } from './trade-game-fixture.ts';
import type { TradeSavedState } from '../../src/world/trade-save-validation.ts';
import type { TradeDayCommand } from '../../src/world/trade-day-commands.ts';
import type { TradeGameSession } from '../../src/world/trade-game-session.ts';

/** 試験専用の試合なし短期カレンダー。製品の初期日程・金額は変更しない。 */
export function idleDayFixture() {
  const fixture = gameFixture();
  const originalSchedule = structuredClone(fixture.initial.state.initialDefinitions.schedule);
  for (const world of [fixture.initial.state, fixture.source]) {
    const defs = 'initialDefinitions' in world ? world.initialDefinitions : world.definitions;
    defs.schedule = [];
    world.dayPlan = { date: world.currentDate, gameIds: [], cursor: 0 };
    for (const policy of Object.values(world.rosterControl.policies)) policy.changeMode = 'manual';
  }
  return { ...fixture, originalSchedule };
}

export function dayCommand(
  saved: TradeSavedState,
  commandId = 'test-complete-day',
): TradeDayCommand {
  return {
    kind: 'completeTradeDay',
    commandId,
    localWorldId: saved.localWorldId,
    worldId: saved.worldId,
    expectedStateRevision: saved.stateRevision,
    expectedDate: saved.currentDate,
  };
}

/** テスト実行時だけ共通エンジンで当日全試合を終える。各ループに上限を設ける。 */
export async function finishSessionDay(session: TradeGameSession): Promise<void> {
  for (let i = 0; i < 4000; i++) {
    const view = session.read(),
      world = view.snapshot.state;
    if (world.dayPlan.cursor === world.dayPlan.gameIds.length) return;
    if (view.pendingCommands === 64) await session.saveManual();
    const saved = session.read().snapshot,
      id = saved.state.dayPlan.gameIds[saved.state.dayPlan.cursor]!;
    const game = saved.state.games[id];
    if (game?.state.phase === 'aborted') throw new Error('当日試験の試合が中断しました');
    session.execute(
      game ? advanceCommand(saved, 'day-events-' + i, 25) : beginCommand(saved, 'day-begin-' + i),
    );
  }
  throw new Error('当日試験の進行回数上限');
}
