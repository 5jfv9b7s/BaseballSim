import { createAgeDevelopmentDefinitions } from './age-development.ts';
import { ROOKIE_AWAKENING_CONFIG } from '../../../config/awakening.ts';
import { ensure } from '../../engine/validation.ts';
import type { WorldDefinitions } from '../../world/types.ts';
import hoshihara from '../profiles/rookies-2026/hoshihara.json' with { type: 'json' };
import aonagi from '../profiles/rookies-2026/aonagi.json' with { type: 'json' };
import kohaku from '../profiles/rookies-2026/kohaku.json' with { type: 'json' };
import asagiri from '../profiles/rookies-2026/asagiri.json' with { type: 'json' };

interface RookieProfileOverride {
  playerId: string;
  firstProYear: number | null;
}

/** 編集入力の登録内容。利用側へJSONの可変参照を渡さない。 */
export function rookieProfileOverrides(): RookieProfileOverride[] {
  return structuredClone([...hoshihara, ...aonagi, ...kohaku, ...asagiri]);
}
/** 新規だけの架空プロフィール例。旧v23以下のプロ入り年を変えない。 */
export function createRookieDevelopmentDefinitions(
  calendar: 'short' | 'annual' = 'short',
): WorldDefinitions {
  const d = createAgeDevelopmentDefinitions(calendar);
  const inputs = rookieProfileOverrides();
  const seen = new Set<string>();
  for (const input of inputs) {
    const profile = d.playerProfiles!.players.find((p) => p.playerId === input.playerId);
    ensure(profile && !seen.has(input.playerId), '新人プロフィールの参照が不正です');
    ensure(
      Object.keys(input).length === 2 &&
        (input.firstProYear === null || Number.isInteger(input.firstProYear)),
      '新人プロフィールの項目が不正です',
    );
    // nullは不明として保持し、プロ1年目を推測しない。
    profile.firstProYear = input.firstProYear;
    profile.generationBatchId = 'initial-rookie-profiles-2026-v1';
    seen.add(input.playerId);
  }
  return {
    ...d,
    version: 'world-definitions-v24',
    awakeningConfig: structuredClone(ROOKIE_AWAKENING_CONFIG),
  };
}
