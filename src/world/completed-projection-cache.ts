import type { GameRecord } from '../game/types.ts';
import type { WorldRecord } from './types.ts';

type Marker = WorldRecord['statApplicationMarkers'][string];

/**
 * 不変な世界から作る読取索引専用。進行中の投球だけでは確定記録を再走査しない。
 * 件数や結果版だけの比較では、読込で差し替わった同版の記録を見逃すため、参照も照合する。
 * 正本・乱数・保存には書き込まない。出力は所有者内で保持し、外へ返す際に複製する。
 */
export class CompletedProjectionCache<T> {
  private previous?: {
    definitions: WorldRecord['definitions'];
    worldId: string;
    version: WorldRecord['version'];
    date: string;
    completedDates: string[];
    games: (GameRecord | undefined)[];
    markers: (Marker | undefined)[];
    value: T;
  };

  private readonly project: (world: WorldRecord) => T;

  constructor(project: (world: WorldRecord) => T) {
    this.project = project;
  }

  read(world: WorldRecord): T {
    const previous = this.previous;
    const games = world.definitions.schedule.map((match) => {
      const game = world.games[match.gameId];
      return game?.result ? game : undefined;
    });
    const markers = world.definitions.schedule.map(
      (match) => world.statApplicationMarkers[match.gameId],
    );
    if (
      previous &&
      previous.definitions === world.definitions &&
      previous.worldId === world.worldId &&
      previous.version === world.version &&
      previous.date === world.currentDate &&
      previous.completedDates === world.completedDates &&
      previous.games.length === games.length &&
      games.every((game, index) => game === previous.games[index]) &&
      markers.every((marker, index) => marker === previous.markers[index])
    )
      return previous.value;

    const value = this.project(world);
    this.previous = {
      definitions: world.definitions,
      worldId: world.worldId,
      version: world.version,
      date: world.currentDate,
      completedDates: world.completedDates,
      games,
      markers,
      value,
    };
    return value;
  }
}
