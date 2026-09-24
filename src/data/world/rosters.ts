import { createAnnualDefinitions } from './annual.ts';
import { createWorldDefinitions } from './index.ts';
import type { WorldDefinitions, WorldSquad } from '../../world/types.ts';
import { players as hoshiharaPlayers } from '../players/hoshihara.ts';
import { players as aonagiPlayers } from '../players/aonagi.ts';
import { players as kohakuPlayers } from '../players/kohaku.ts';
import { players as asagiriPlayers } from '../players/asagiri.ts';
import { repertoires as hoshiharaPitches } from '../repertoires/hoshihara.ts';
import { repertoires as aonagiPitches } from '../repertoires/aonagi.ts';
import { repertoires as kohakuPitches } from '../repertoires/kohaku.ts';
import { repertoires as asagiriPitches } from '../repertoires/asagiri.ts';
import { squad as hoshihara } from '../teams/hoshihara.ts';
import { squad as aonagi } from '../teams/aonagi.ts';
import { squad as kohaku } from '../teams/kohaku.ts';
import { squad as asagiri } from '../teams/asagiri.ts';

/** 全球団・全選手・全持ち球の編集データを結合する。能力や別球団を生成しない。 */
export function createRosterSquads(): WorldSquad[] {
  return structuredClone([
    { ...hoshihara, players: hoshiharaPlayers, pitches: hoshiharaPitches },
    { ...aonagi, players: aonagiPlayers, pitches: aonagiPitches },
    { ...kohaku, players: kohakuPlayers, pitches: kohakuPitches },
    { ...asagiri, players: asagiriPlayers, pitches: asagiriPitches },
  ]);
}

/** 開始時に複製する。データファイルの後の編集を開始済み世界へ混入させない。 */
export function createRosterDefinitions(calendar: 'short' | 'annual' = 'short'): WorldDefinitions {
  const definitions = calendar === 'annual' ? createAnnualDefinitions() : createWorldDefinitions();
  return { ...definitions, version: 'world-definitions-v3', squads: createRosterSquads() };
}
