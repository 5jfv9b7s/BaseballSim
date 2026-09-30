import { rosterPolicy as hoshihara } from '../roster-policies/hoshihara.ts';
import { rosterPolicy as aonagi } from '../roster-policies/aonagi.ts';
import { rosterPolicy as kohaku } from '../roster-policies/kohaku.ts';
import { rosterPolicy as asagiri } from '../roster-policies/asagiri.ts';
import { createRegistrationDefinitions } from './registrations.ts';
import type { WorldDefinitions } from '../../world/types.ts';

export function createRosterPolicyDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createRegistrationDefinitions(calendar);
  const policies = {
    'hoshihara-first': hoshihara,
    'aonagi-first': aonagi,
    'kohaku-first': kohaku,
    'asagiri-first': asagiri,
  };
  return structuredClone({
    ...definitions,
    version: 'world-definitions-v5',
    squads: definitions.squads.map((squad) => ({
      ...squad,
      rosterPolicyInput: policies[squad.squadId as keyof typeof policies],
    })),
  });
}
