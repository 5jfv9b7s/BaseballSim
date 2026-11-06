import { ensure, integer } from '../engine/validation.ts';
import { financeId, uniqueFinanceIds } from '../finance/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { stepRecord } from '../game/engine.ts';
import { finalizeGame } from '../game/results.ts';
import { exactKeys } from './snapshot-codec.ts';
import { prepareTradeMatch } from './trade-match.ts';
import { tradeSquadRoster } from './trade-squad-roster.ts';
import { sampleRegisteredConditions } from './condition.ts';
import { applyPhysicalGame } from './physical.ts';
import { recordPitchingAppearances } from './rest.ts';
import { applyContribution, gameContribution } from './stats.ts';
import type { TradeSavedState } from './trade-save-validation.ts';
import type { TradeMatchRequest } from './trade-match.ts';

interface CommandContext {
  commandId: string;
  localWorldId: string;
  worldId: string;
  expectedStateRevision: number;
  gameId: string;
}
export type TradeGameCommand = CommandContext &
  (
    | { kind: 'beginTradeGame'; benchIds: TradeMatchRequest['benchIds'] }
    | { kind: 'advanceTradeGame'; eventCount: number; expectedNextEventSeq: number }
  );

/** 指示とイベント区間の対応。試合記録や全世界を毎回複製して履歴にはしない。 */
export interface TradeGameReceipt {
  modelVersion: 'trade-game-commands-v1';
  commandId: string;
  fingerprint: string;
  gameId: string;
  kind: TradeGameCommand['kind'];
  committedStateRevision: number;
  firstEventSeq: number;
  nextEventSeq: number;
}

/** 手動保存の再計算を有限にする試作上限。到達したら保存してから続きを処理する。 */
export const MAX_GAME_COMMANDS_PER_SAVE = 64;

export function parseTradeGameCommand(value: unknown): TradeGameCommand {
  ensure(value && typeof value === 'object', '試合指示が不正です');
  const command = value as TradeGameCommand;
  ensure(['beginTradeGame', 'advanceTradeGame'].includes(command.kind), '未対応の試合指示です');
  exactKeys(
    command,
    [
      'kind',
      'commandId',
      'localWorldId',
      'worldId',
      'expectedStateRevision',
      'gameId',
      ...(command.kind === 'beginTradeGame'
        ? ['benchIds']
        : ['eventCount', 'expectedNextEventSeq']),
    ],
    '試合指示',
  );
  for (const id of [command.commandId, command.localWorldId, command.worldId, command.gameId])
    financeId(id);
  integer(command.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '試合指示の状態版');
  if (command.kind === 'beginTradeGame') {
    exactKeys(command.benchIds, ['away', 'home'], '両チームのベンチ');
    for (const side of ['away', 'home'] as const) {
      ensure(Array.isArray(command.benchIds[side]), '両チームのベンチを明示してください');
      uniqueFinanceIds(command.benchIds[side], '試合指示のベンチID');
    }
  } else {
    integer(command.eventCount, 1, 25, '進行イベント数');
    integer(command.expectedNextEventSeq, 1, Number.MAX_SAFE_INTEGER - 25, '次イベント番号');
  }
  ensure(canonicalJson(command).length <= 16384, '試合指示の容量を超えています');
  return command;
}

/**
 * 作業状態への純粋な指示適用。共有する過去記録は不変として扱う。
 * 所有コーディネーターは返却状態を保持し、外部への読取は複製する。DBへは書かない。
 */
export function applyTradeGameCommand(input: TradeSavedState, value: TradeGameCommand) {
  const command = parseTradeGameCommand(structuredClone(value));
  ensure(
    command.localWorldId === input.localWorldId && command.worldId === input.worldId,
    '別プレイ・別世界への試合指示です',
  );
  const fingerprint = canonicalJson(command);
  const prior = input.gameReceipts?.find((r) => r.commandId === command.commandId);
  ensure(
    !input.dayReceipts?.some((r) => r.commandId === command.commandId),
    '日次指示と同じIDは使えません',
  );
  ensure(
    !input.tradeReceipts.some((r) => r.commandId === command.commandId),
    '移籍指示と同じIDは使えません',
  );
  if (prior) {
    ensure(prior.fingerprint === fingerprint, '同じ試合指示IDの内容が異なります');
    return { status: 'replayed' as const, receipt: structuredClone(prior) };
  }
  ensure(command.expectedStateRevision === input.stateRevision, '古い状態への試合指示です');
  integer(input.stateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '作業状態版');
  const world = input.state,
    defs = world.initialDefinitions;
  const scheduled = defs.schedule.find((g) => g.gameId === command.gameId);
  ensure(
    scheduled && scheduled.date === world.currentDate && world.dayPlan.date === world.currentDate,
    '当日の試合だけを進行できます',
  );
  ensure(
    world.dayPlan.gameIds[world.dayPlan.cursor] === command.gameId,
    '日次計画の次の試合を指定してください',
  );
  let next = { ...world, games: { ...world.games } };
  let firstEventSeq: number;
  if (command.kind === 'beginTradeGame') {
    const prepared = prepareTradeMatch(world, command);
    ensure(
      !world.registration.gameRosters[command.gameId] && !world.condition.samples[command.gameId],
      '開始前の試合に既存の名簿・調子サンプルが残っています',
    );
    next.games[command.gameId] = prepared.game;
    next.registration = {
      ...world.registration,
      gameRosters: { ...world.registration.gameRosters, [command.gameId]: prepared.rosters },
    };
    next.condition = sampleRegisteredConditions(
      world.condition,
      defs,
      command.gameId,
      [scheduled.awaySquadId, scheduled.homeSquadId].map((squadId) => {
        const roster = tradeSquadRoster(world, squadId);
        return {
          squadId,
          clubId: roster.clubId,
          registrations: roster.registeredPlayerIds.map((id) =>
            world.registration.registrations.find((r) => r.playerId === id && r.until === null)!,
          ),
        };
      }),
    );
    firstEventSeq = prepared.game.state.nextEventSeq;
  } else {
    const previous = world.games[command.gameId];
    ensure(
      previous && ['readyForPitch', 'halfComplete'].includes(previous.state.phase),
      '開始済みで進行可能な試合がありません',
    );
    ensure(
      previous.state.nextEventSeq === command.expectedNextEventSeq,
      '古いイベント番号への進行指示です',
    );
    ensure(
      world.registration.gameRosters[command.gameId] && world.condition.samples[command.gameId],
      '開始時の名簿・調子サンプルがありません',
    );
    const game = structuredClone(previous);
    firstEventSeq = game.state.nextEventSeq;
    for (let i = 0; i < command.eventCount; i++) {
      stepRecord(game);
      if (game.state.phase === 'gameComplete') {
        finalizeGame(game);
        break;
      }
      if (game.state.phase === 'aborted') break;
    }
    next.games[command.gameId] = game;
    const inputs = {
      definitions: defs,
      currentDate: world.currentDate,
      physical: world.physical,
      growth: world.growth,
      restControl: world.restControl,
    };
    next.physical = applyPhysicalGame(inputs, command.gameId, game);
    next.restControl = recordPitchingAppearances(inputs, command.gameId, game);
    const rosters = structuredClone(world.registration.gameRosters[command.gameId]!);
    for (const side of ['away', 'home'] as const) {
      const appeared = new Set([
        ...game.fixture.teams[side].lineup.map((p) => p.playerId),
        ...game.state.usedPitcherIds![side],
      ]);
      for (const row of rosters[side].participants) row.appeared = appeared.has(row.playerId);
    }
    next.registration = {
      ...world.registration,
      gameRosters: { ...world.registration.gameRosters, [command.gameId]: rosters },
    };
    if (game.result) {
      next = {
        ...next,
        contributions: { ...world.contributions },
        statApplicationMarkers: { ...world.statApplicationMarkers },
        dayPlan: { ...world.dayPlan, cursor: world.dayPlan.cursor + 1 },
        management: {
          ...world.management,
          pitcherUsagePlans: structuredClone(world.management.pitcherUsagePlans),
        },
      };
      applyContribution(next, gameContribution(defs, scheduled, game));
      for (const id of [scheduled.awaySquadId, scheduled.homeSquadId]) {
        const plan = next.management.pitcherUsagePlans[id]!;
        ensure(
          plan.nextSlotNo !== null && plan.rotationSlots.length > 0,
          '完了時のローテーションが不正です',
        );
        plan.nextSlotNo = (plan.nextSlotNo % plan.rotationSlots.length) + 1;
      }
    }
  }
  const receipt: TradeGameReceipt = {
    modelVersion: 'trade-game-commands-v1',
    commandId: command.commandId,
    fingerprint,
    gameId: command.gameId,
    kind: command.kind,
    committedStateRevision: input.stateRevision + 1,
    firstEventSeq,
    nextEventSeq: next.games[command.gameId]!.state.nextEventSeq,
  };
  const snapshot: TradeSavedState = {
    ...input,
    state: next,
    stateRevision: input.stateRevision + 1,
    gameReceipts: [...(input.gameReceipts ?? []), receipt],
  };
  return { status: 'applied' as const, receipt: structuredClone(receipt), snapshot };
}
