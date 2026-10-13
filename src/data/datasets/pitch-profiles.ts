import { additionalRepertoires } from '../repertoires/pitch-profiles/index.ts';
import { createCurrentFixture } from './current.ts';
import { createPitchProfileConfig } from '../pitch-types/profiles.ts';

export function createPitchProfileFixture() {
  const fixture = createCurrentFixture();
  fixture.pitches.push(
    ...structuredClone(
      additionalRepertoires.filter((p) =>
        fixture.players.some((player) => player.playerId === p.playerId),
      ),
    ),
  );
  return { ...fixture, pitchProfiles: createPitchProfileConfig() };
}
