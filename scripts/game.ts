import { createGame, runToCompletion } from '../src/game/engine.ts';
import { finalizeGame } from '../src/game/results.ts';

try {
  const seed = process.argv[2] === undefined ? 20260923 : Number(process.argv[2]);
  const record = createGame(seed);
  runToCompletion(record);
  const result = finalizeGame(record);
  console.log(
    JSON.stringify(
      {
        seed,
        model: 'game-prototype-v1',
        score: result.score,
        innings: result.innings,
        winner: result.winner,
        endReason: record.state.endReason,
        totalPitches: result.totalPitches,
        batting: result.batting,
        pitching: result.pitching,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
