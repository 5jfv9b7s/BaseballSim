import { registrationRules } from '../../../config/registration.ts';
import { registrations as hoshihara } from '../registrations/hoshihara.ts';
import { registrations as aonagi } from '../registrations/aonagi.ts';
import { registrations as kohaku } from '../registrations/kohaku.ts';
import { registrations as asagiri } from '../registrations/asagiri.ts';
import { createRosterDefinitions } from './rosters.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 現在の編集データは新規プレイだけで読む。読込時は保存内定義を使う。 */
export function createRegistrationDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createRosterDefinitions(calendar);
  const entries = {
    'hoshihara-first': hoshihara,
    'aonagi-first': aonagi,
    'kohaku-first': kohaku,
    'asagiri-first': asagiri,
  };
  return structuredClone({
    ...definitions,
    version: 'world-definitions-v4',
    registrationRules,
    squads: definitions.squads.map((squad) => ({
      ...squad,
      registrationInputs: entries[squad.squadId as keyof typeof entries],
    })),
  });
}
