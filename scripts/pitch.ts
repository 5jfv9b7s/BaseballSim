import { FIXTURE, createInitialState } from '../src/data/fixture.ts';
import { simulatePitch } from '../src/engine/pitch.ts';

try {
  const seed = process.argv[2] === undefined ? 20260923 : Number(process.argv[2]);
  const result = simulatePitch(createInitialState(seed), FIXTURE, 'cli-command-001');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
