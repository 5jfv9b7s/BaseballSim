import { createPitchProfileDefinitions } from './pitch-profiles.ts';
import { individualRepertoires } from '../repertoires/individual/index.ts';
import { ensure } from '../../engine/validation.ts';
import { validateDelivery } from '../../engine/pitch-profile-validation.ts';
import type { WorldDefinitions } from '../../world/types.ts';

/** 定義v15は個人別持ち球のデータ更新。世界・試合の計算式は変更しない。 */
export function createIndividualPitchDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const definitions = createPitchProfileDefinitions(calendar);
  const playerIds = new Set(
    definitions.squads.flatMap((squad) => squad.players.map((p) => p.playerId)),
  );
  const pitchIds = new Set<string>();
  for (const pitch of individualRepertoires) {
    ensure(playerIds.has(pitch.playerId), `持ち球の選手が存在しません: ${pitch.playerId}`);
    ensure(!pitchIds.has(pitch.pitchId), `持ち球IDが重複しています: ${pitch.pitchId}`);
    ensure(pitch.delivery !== undefined, `個人別の球質が必要です: ${pitch.pitchId}`);
    validateDelivery(pitch.delivery);
    pitchIds.add(pitch.pitchId);
  }
  for (const squad of definitions.squads) {
    const ids = new Set(squad.players.map((player) => player.playerId));
    squad.pitches = structuredClone(
      individualRepertoires.filter((pitch) => ids.has(pitch.playerId)),
    );
  }
  return { ...definitions, version: 'world-definitions-v15' };
}
