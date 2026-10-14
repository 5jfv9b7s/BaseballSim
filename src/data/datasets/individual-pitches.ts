import { createCurrentFixture } from './current.ts';
import { createPitchProfileConfig } from '../pitch-types/profiles.ts';
import { individualRepertoires } from '../repertoires/individual/index.ts';

/** 0.26.0以降の新規v11試合。計算モデルとデータ構造は従来と共通。 */
export function createIndividualPitchFixture() {
  const fixture = createCurrentFixture();
  const playerIds = new Set(fixture.players.map((player) => player.playerId));
  return {
    ...fixture,
    pitches: structuredClone(
      individualRepertoires.filter((pitch) => playerIds.has(pitch.playerId)),
    ),
    pitchProfiles: createPitchProfileConfig(),
  };
}
