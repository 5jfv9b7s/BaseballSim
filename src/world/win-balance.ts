import type { WorldView } from './controller.ts';
import type { StatKey } from './types.ts';

export interface BalancePoint {
  date: string;
  wins: number;
  losses: number;
  draws: number;
  balance: number;
}
export interface BalanceSeries {
  squadId: string;
  name: string;
  clubId: string;
  points: BalancePoint[];
}

/** 勝数−敗数。未完了のスコアは集計せず、休養日と引分は前の値を保つ。 */
export function winBalanceSeries(
  view: Pick<WorldView, 'games' | 'definitions' | 'currentDate'>,
  scope: StatKey['statScope'],
): BalanceSeries[] {
  const squads =
    scope === 'farmRegular' ? (view.definitions.farm?.squads ?? []) : view.definitions.squads;
  const end =
    view.currentDate < view.definitions.endDate ? view.currentDate : view.definitions.endDate;
  const gamesByDate = new Map<string, WorldView['games']>();
  for (const game of view.games) {
    if (game.statScope !== scope || game.status !== 'completed' || !game.result) continue;
    const games = gamesByDate.get(game.date) ?? [];
    games.push(game);
    gamesByDate.set(game.date, games);
  }
  const series = squads.map((squad) => ({
    squadId: squad.squadId,
    clubId: squad.team.clubId,
    name: squad.team.name,
    points: [] as BalancePoint[],
  }));
  const totals = new Map(squads.map((squad) => [squad.squadId, { wins: 0, losses: 0, draws: 0 }]));
  for (
    let date = view.definitions.startDate;
    date <= end;
    date = new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10)
  ) {
    for (const game of gamesByDate.get(date) ?? []) {
      const away = totals.get(game.awaySquadId);
      const home = totals.get(game.homeSquadId);
      if (!away || !home) continue;
      const score = game.result!.score;
      if (score.away === score.home) {
        away.draws++;
        home.draws++;
      } else if (score.away > score.home) {
        away.wins++;
        home.losses++;
      } else {
        home.wins++;
        away.losses++;
      }
    }
    for (const item of series) {
      const total = totals.get(item.squadId)!;
      item.points.push({ date, ...total, balance: total.wins - total.losses });
    }
  }
  return series;
}
