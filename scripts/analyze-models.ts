import type { AppearanceOutcome } from '../src/game/types.ts';
import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';
import type { GameModelVersion } from '../src/game/model-v2.ts';

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
for (const version of ['game-prototype-v1', 'game-prototype-v2'] as const) {
  reports.push(analyze(version));
}
console.log(
  JSON.stringify({ count, start, seedFormula: 'imul(i,2654435761) >>> 0', reports }, null, 2),
);

function analyze(version: GameModelVersion) {
  const outcomes: Record<string, number> = {};
  const battedTypes: Record<string, { count: number; outs: number }> = {};
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
    for (const event of game.events) {
      if (event.outcome) outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
      if (event.battedBall) {
        const type = (battedTypes[event.battedBall.type] ??= { count: 0, outs: 0 });
        type.count++;
        type.outs += event.battedBall.projectedBases === 0 ? 1 : 0;
        const bases = event.outcome ? (hitBases[event.outcome] ?? 0) : 0;
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
  return {
    version,
    games: count,
    runs,
    runsPerGame: runs / count,
    draws,
    pitchesPerAppearance: pitches / appearances,
    battingAverage: hits / (appearances - (outcomes.walk ?? 0) - (outcomes.hitByPitch ?? 0)),
    appearances,
    outcomes,
    extraAdvances,
    battedTypes: Object.fromEntries(
      Object.entries(battedTypes).map(([type, row]) => [
        type,
        { ...row, outRate: row.outs / row.count },
      ]),
    ),
  };
}
