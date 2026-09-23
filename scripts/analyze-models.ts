import type { AppearanceOutcome } from '../src/game/types.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import { GAME_MODEL_VERSIONS, type GameModelVersion } from '../src/game/model-registry.ts';

const hitBases: Partial<Record<AppearanceOutcome, number>> = {
  single: 1,
  double: 2,
  triple: 3,
  homeRun: 4,
};

const count = Number(process.argv[2] ?? 200);
const start = Number(process.argv[3] ?? 1);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 1000 ||
  !Number.isInteger(start) ||
  start < 1 ||
  start + count > 1000000
) {
  throw new Error('試合数1～1000、開始番号1以上、合計1000000未満を指定してください');
}
const reports = [];
for (const version of GAME_MODEL_VERSIONS) {
  reports.push(analyze(version));
}
console.log(
  JSON.stringify({ count, start, seedFormula: 'imul(i,2654435761) >>> 0', reports }, null, 2),
);

function analyze(version: GameModelVersion) {
  const outcomes: Record<string, number> = {};
  const battedTypes: Record<string, { count: number; outs: number }> = {};
  const pitchCounts: Record<
    string,
    { pitches: number; swings: number; contacts: number; fouls: number; inside: number }
  > = {};
  const battedCounts: Record<
    string,
    { count: number; hits: number; totalBases: number; exitSpeedSum: number }
  > = {};
  const scoredByReach: Record<string, number> = {};
  const runsByPlay: Record<string, number> = {};
  const walkCounts: Record<string, number> = {};
  const basesLoaded = { appearances: 0, walks: 0, hitByPitch: 0, walkRuns: 0, hitByPitchRuns: 0 };
  const strikeouts = { looking: 0, swingingInside: 0, swingingOutside: 0 };
  const twoStrikeZones = {
    inside: { pitches: 0, swings: 0, contacts: 0, fouls: 0 },
    outside: { pitches: 0, swings: 0, contacts: 0, fouls: 0 },
  };
  let insidePitches = 0;
  let swungPitches = 0;
  let contacts = 0;
  let fouls = 0;
  let firstPitchFinishes = 0;
  let runs = 0,
    draws = 0,
    pitches = 0,
    appearances = 0,
    extraAdvances = 0;
  for (let i = start; i < start + count; i++) {
    const game = createGame(Math.imul(i, 2654435761) >>> 0, undefined, version);
    runToCompletion(game);
    const result = finalizeGame(game); // 集計整合と正常終了も検査する。
    runs += result.score.home + result.score.away;
    draws += result.winner === 'draw' ? 1 : 0;
    pitches += result.totalPitches;
    appearances += result.completedAppearances;
    const reachedBy = new Map<string, AppearanceOutcome>();
    for (const event of game.events) {
      for (const action of event.runnerActions) {
        if (action.from === 'batter' && event.outcome)
          reachedBy.set(action.runInstanceId, event.outcome);
      }
      for (const run of event.runDecisions) {
        const reason = reachedBy.get(run.runInstanceId);
        if (!reason || !event.outcome) throw new Error('得点した走者の出塁理由が不明です');
        scoredByReach[reason] = (scoredByReach[reason] ?? 0) + 1;
        runsByPlay[event.outcome] = (runsByPlay[event.outcome] ?? 0) + 1;
      }
      if (event.outcome === 'walk') {
        const key = String(event.before.count.strikes);
        walkCounts[key] = (walkCounts[key] ?? 0) + 1;
      }
      if (event.outcome && event.before.baseOccupants.every(Boolean)) {
        basesLoaded.appearances++;
        if (event.outcome === 'walk') {
          basesLoaded.walks++;
          basesLoaded.walkRuns += event.runDecisions.length;
        }
        if (event.outcome === 'hitByPitch') {
          basesLoaded.hitByPitch++;
          basesLoaded.hitByPitchRuns += event.runDecisions.length;
        }
      }
      if (event.outcome && event.before.count.balls === 0 && event.before.count.strikes === 0)
        firstPitchFinishes++;
      if (event.pitch) {
        const p = event.pitch;
        insidePitches += p.zoneCode.startsWith('S_') ? 1 : 0;
        swungPitches += p.action === 'swing' ? 1 : 0;
        contacts += p.contact !== 'none' ? 1 : 0;
        fouls += p.contact === 'foul' ? 1 : 0;
        const key = p.countBefore.balls + '-' + p.countBefore.strikes;
        const c = (pitchCounts[key] ??= {
          pitches: 0,
          swings: 0,
          contacts: 0,
          fouls: 0,
          inside: 0,
        });
        c.pitches++;
        c.swings += p.action === 'swing' ? 1 : 0;
        c.contacts += p.contact !== 'none' ? 1 : 0;
        c.fouls += p.contact === 'foul' ? 1 : 0;
        const inside = p.zoneCode.startsWith('S_');
        c.inside += inside ? 1 : 0;
        if (p.countBefore.strikes === 2) {
          const zone = twoStrikeZones[inside ? 'inside' : 'outside'];
          zone.pitches++;
          zone.swings += p.action === 'swing' ? 1 : 0;
          zone.contacts += p.contact !== 'none' ? 1 : 0;
          zone.fouls += p.contact === 'foul' ? 1 : 0;
        }
        if (event.outcome === 'strikeout') {
          if (p.ruling === 'calledStrike') strikeouts.looking++;
          else if (p.ruling === 'swingingStrike')
            strikeouts[inside ? 'swingingInside' : 'swingingOutside']++;
          else throw new Error('三振の決着球が不正です');
        }
      }
      if (event.outcome) outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      if (event.battedBall) {
        const type = (battedTypes[event.battedBall.type] ??= { count: 0, outs: 0 });
        type.count++;
        type.outs += event.battedBall.projectedBases === 0 ? 1 : 0;
        const bases = event.outcome ? (hitBases[event.outcome] ?? 0) : 0;
        const key = String(event.before.count.strikes);
        const group = (battedCounts[key] ??= { count: 0, hits: 0, totalBases: 0, exitSpeedSum: 0 });
        group.count++;
        group.hits += bases > 0 ? 1 : 0;
        group.totalBases += bases;
        group.exitSpeedSum += event.battedBall.exitVelocityCentiKph;
        for (const action of event.runnerActions) {
          if (
            action.from !== 'batter' &&
            (action.to === 'home' ? 4 : action.to) - action.from > bases
          )
            extraAdvances++;
        }
      }
    }
  }
  const hits = ['single', 'double', 'triple', 'homeRun'].reduce(
    (n, key) => n + (outcomes[key] ?? 0),
    0,
  );
  if (
    Object.values(scoredByReach).reduce((sum, n) => sum + n, 0) !== runs ||
    Object.values(runsByPlay).reduce((sum, n) => sum + n, 0) !== runs
  ) {
    throw new Error('得点内訳がスコアと一致しません');
  }
  return {
    version,
    games: count,
    runs,
    runsPerGame: runs / count,
    draws,
    pitchesPerAppearance: pitches / appearances,
    battingAverage: hits / (appearances - (outcomes.walk ?? 0) - (outcomes.hitByPitch ?? 0)),
    appearances,
    walkRate: (outcomes.walk ?? 0) / appearances,
    hitByPitchRate: (outcomes.hitByPitch ?? 0) / appearances,
    strikeoutRate: (outcomes.strikeout ?? 0) / appearances,
    firstPitchFinishRate: firstPitchFinishes / appearances,
    zoneRate: insidePitches / pitches,
    swingRate: swungPitches / pitches,
    contactRate: contacts / swungPitches,
    foulPerContact: fouls / contacts,
    pitchCounts,
    strikeouts,
    walkCounts,
    basesLoaded,
    twoStrikeZones,
    outcomes,
    scoredByReach,
    runsByPlay,
    battedCounts: Object.fromEntries(
      Object.entries(battedCounts).map(([strikes, row]) => [
        strikes,
        {
          ...row,
          meanExitSpeedKph: row.exitSpeedSum / row.count / 100,
          hitRate: row.hits / row.count,
        },
      ]),
    ),
    extraAdvances,
    battedTypes: Object.fromEntries(
      Object.entries(battedTypes).map(([type, row]) => [
        type,
        { ...row, outRate: row.outs / row.count },
      ]),
    ),
  };
}
