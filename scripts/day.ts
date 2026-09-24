import { advanceWorld, completeDay, createWorld, worldPhase } from '../src/world/engine.ts';
import { standings } from '../src/world/stats.ts';

const seed = Number(process.argv[2] ?? 20260924);
let world = createWorld(seed);
while (worldPhase(world) === 'playing') world = advanceWorld(world, 25);
world = completeDay(world, world.currentDate);

console.log('結果の日付:', world.lastCompletedDate, '/ 現在日:', world.currentDate);
for (const game of Object.values(world.games)) {
  console.log(
    game.fixture.teams.away.name,
    game.result!.score.away,
    '-',
    game.result!.score.home,
    game.fixture.teams.home.name,
  );
}
console.table(
  standings(world.stats).map((row) => ({
    順位: row.rank ?? '-',
    球団: world.definitions.squads.find((squad) => squad.squadId === row.squadId)!.team.name,
    勝: row.wins,
    敗: row.losses,
    分: row.draws,
    勝率: row.winPercentage?.toFixed(3) ?? '-',
  })),
);
console.log('CLIは計算確認用です。ブラウザの保存は更新しません。');
