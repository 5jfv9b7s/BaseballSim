import { additionalRepertoires } from '../repertoires/pitch-profiles/index.ts';
import { createBullpenDefinitions } from './bullpen.ts';
import { createPitchProfileConfig } from '../pitch-types/profiles.ts';
import type { WorldDefinitions } from '../../world/types.ts';
export function createPitchProfileDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createBullpenDefinitions(calendar);
  // 二軍は所属球団と同じ名簿を参照する。元の保存データへ後付けしない。
  for (const squad of definitions.squads) {
    squad.pitches.push(
      ...structuredClone(
        additionalRepertoires.filter((p) =>
          squad.players.some((player) => player.playerId === p.playerId),
        ),
      ),
    );
  }
  return {
    ...definitions,
    version: 'world-definitions-v14',
    pitchProfiles: createPitchProfileConfig(),
  };
}
