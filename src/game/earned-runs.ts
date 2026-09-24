import { ensure } from '../engine/validation.ts';
import { hitDestinations } from './running.ts';
import { evaluateInPlayV2 } from './in-play-v2.ts';
import type {
  EarnedRunContext,
  EarnedRunEvaluation,
  GameEvent,
  GameRecord,
  Runner,
  TeamSide,
} from './types.ts';

type Reconstruction = {
  definition: EarnedRunContext;
  outs: number;
  bases: [Runner | null, Runner | null, Runner | null];
  scored: Set<string>;
};

function startContext(event: GameEvent, pitcherId: string | null): Reconstruction {
  const initialOuts = pitcherId === null ? 0 : event.before.outs;
  const initialBases: Reconstruction['bases'] =
    pitcherId === null ? [null, null, null] : structuredClone(event.before.baseOccupants);
  return {
    definition: {
      inning: event.before.inning,
      half: event.before.half,
      pitcherId,
      startEventSeq: event.eventSeq,
      initialOuts,
      initialBases: structuredClone(initialBases),
      trace: [],
    },
    outs: initialOuts,
    bases: initialBases,
    scored: new Set(),
  };
}

/** 実際の打球と打席結果を保ち、失策だけを一塁アウトへ置き換える限定再構成。 */
function reconstruct(context: Reconstruction, event: GameEvent, record: GameRecord): void {
  if (!event.outcome) return;
  if (context.outs < 3) {
    const outcome = event.outcome;
    const state = {
      ...record.state,
      ...event.before,
      outs: context.outs,
      baseOccupants: context.bases,
    };
    const batterAction = event.runnerActions.find((action) => action.from === 'batter');
    const newRunner = (): Runner => {
      ensure(batterAction && event.pitch, '再構成に打者走者の記録がありません');
      return {
        runInstanceId: batterAction.runInstanceId,
        originalRunnerId: event.pitch.batterId,
        currentRunnerId: event.pitch.batterId,
        reachedReason: outcome,
        reachedEventSeq: event.eventSeq,
        responsiblePitcherId: batterAction.responsiblePitcherId,
      };
    };
    const move = (runner: Runner, destination: number) => {
      if (destination >= 4) context.scored.add(runner.runInstanceId);
      else context.bases[destination - 1] = runner;
    };
    const hitBases = ({ single: 1, double: 2, triple: 3, homeRun: 4 } as Record<string, number>)[
      outcome
    ];
    if (outcome === 'reachedOnError') {
      // 今回の失策は単独一塁アウト機会だけ。走者は失策による押し出し前の塁に留める。
      context.outs++;
    } else if (outcome === 'walk' || outcome === 'hitByPitch') {
      let forced = 0;
      while (forced < 3 && context.bases[forced]) forced++;
      for (let i = forced - 1; i >= 0; i--) {
        const runner = context.bases[i]!;
        context.bases[i] = null;
        move(runner, i + 2);
      }
      move(newRunner(), 1);
    } else if (hitBases) {
      // 失策で早く生還した走者も仮想塁上に残し、後続の安打による生還まで追う。
      const destinations = hitDestinations(state, record.fixture, hitBases, event.battedBall);
      const previous = context.bases;
      context.bases = [null, null, null];
      for (let i = 2; i >= 0; i--) if (previous[i]) move(previous[i]!, destinations[i]!);
      move(newRunner(), hitBases);
    } else if (outcome === 'fieldersChoice') {
      // 失策出塁者が存在しない再構成では、打者を一塁アウトとして扱う。
      const forced = context.bases[0];
      context.outs++;
      if (forced) {
        const replacement = newRunner();
        replacement.responsiblePitcherId = forced.responsiblePitcherId;
        context.bases[0] = replacement;
      }
    } else {
      // 新しい併殺を仮定せず、実際に成立した併殺だけを対象とする。
      if (event.outDecisions.length === 2 && context.bases[0]) {
        context.bases[0] = null;
        context.outs++;
      }
      const sacrifice =
        outcome === 'sacrificeFly' &&
        evaluateInPlayV2(state, record.fixture, event.battedBall, event.pitch)?.resolution ===
          'sacrificeFly';
      context.outs++;
      if (sacrifice && context.outs < 3 && context.bases[2]) {
        context.scored.add(context.bases[2].runInstanceId);
        context.bases[2] = null;
      }
    }
    context.outs = Math.min(context.outs, 3);
    if (context.outs === 3) context.bases = [null, null, null];
  }
  context.definition.trace.push({
    eventSeq: event.eventSeq,
    outs: context.outs,
    bases: structuredClone(context.bases),
    scoredRunInstanceIds: [...context.scored],
  });
}

/** 正常終了時に判定する。回の後続プレーを調べ、実際の生還だけへ自責点を帰属させる。 */
export function settleEarnedRuns(record: GameRecord): void {
  ensure(record.state.phase === 'gameComplete', '自責点は正常終了後に確定します');
  ensure(!record.earnedRunEvaluation, '自責点の二重確定はできません');
  const evaluation: EarnedRunEvaluation = {
    modelVersion: 'earned-runs-prototype-v1',
    contexts: [],
  };
  const innings = new Map<string, GameEvent[]>();
  for (const event of record.events) {
    if (!event.pitch) continue;
    const key = `${event.before.inning}:${event.before.half}`;
    const events = innings.get(key) ?? [];
    events.push(event);
    innings.set(key, events);
  }
  for (const events of innings.values()) {
    const team = startContext(events[0]!, null);
    const pitchers = new Map<string, Reconstruction>();
    for (const event of events) {
      const pitcherId = event.pitch!.pitcherId;
      if (!pitchers.has(pitcherId)) pitchers.set(pitcherId, startContext(event, pitcherId));
      reconstruct(team, event, record);
      // 降板後のプレーでも、その投手が残した走者の生還を追跡する。
      for (const context of pitchers.values()) reconstruct(context, event, record);
    }
    evaluation.contexts.push(team.definition, ...[...pitchers.values()].map((c) => c.definition));
    for (const event of events) {
      for (const run of event.runDecisions) {
        const pitcher = pitchers.get(run.responsiblePitcherId);
        ensure(pitcher, '責任投手の再構成記録がありません');
        run.earnedForTeam = team.scored.has(run.runInstanceId);
        run.earnedForPitcher = pitcher.scored.has(run.runInstanceId);
        run.earned = run.earnedForPitcher;
        if (run.earnedForPitcher) {
          const side: TeamSide = event.before.half === 'top' ? 'home' : 'away';
          event.credits.push({
            creditId: `${event.gameId}:credit:${event.eventSeq}:${event.credits.length + 1}`,
            playerId: run.responsiblePitcherId,
            clubId: record.fixture.teams[side].clubId,
            category: 'pitching',
            metricCode: 'earnedRuns',
            amount: 1,
            sourceEventSeq: event.eventSeq,
            ruleRef: event.rulesetVersion,
          });
        }
      }
    }
  }
  record.earnedRunEvaluation = evaluation;
}
