import { ensure } from '../engine/validation.ts';
import type { GameFixture, GamePlayer } from './types.ts';

export { createGameFixture } from '../data/datasets/legacy-v1.ts';

export function getPlayer(fixture: GameFixture, playerId: string): GamePlayer {
  const player = fixture.players.find((p) => p.playerId === playerId);
  ensure(player, '選手IDの参照が不正です');
  return player;
}

export function playerName(fixture: GameFixture, playerId: string): string {
  const p = getPlayer(fixture, playerId);
  return `${p.familyName} ${p.givenName}`;
}
