import { createCurrentFixture } from '../datasets/current.ts';
import type { WorldSquad } from '../../world/types.ts';
import type { TeamSide } from '../../game/types.ts';

/**
 * 架空4球団。追加2球団の能力・持ち球は既存2球団の複製という試作仮定。
 * 元選手IDを接頭辞付きで写し、名前や配列の順番をIDにしない。
 * 能力を個別調整したい場合は、この返却データを独立したplayers/repertoiresへ移せる。
 */
export function createWorldSquads(): WorldSquad[] {
  const fixture = createCurrentFixture();

  function original(side: TeamSide, squadId: string): WorldSquad {
    const { side: _side, ...team } = fixture.teams[side];
    const playerIds = [...team.lineup.map((slot) => slot.playerId), ...team.pitcherIds];
    return {
      squadId,
      team,
      players: fixture.players.filter((player) => playerIds.includes(player.playerId)),
      pitches: fixture.pitches.filter((pitch) => playerIds.includes(pitch.playerId)),
    };
  }

  function copy(source: WorldSquad, code: string, name: string, familyName: string): WorldSquad {
    const rename = (id: string) => code + '-' + id;
    return {
      squadId: code + '-first',
      team: {
        clubId: code,
        name,
        lineup: source.team.lineup.map((slot) => ({ ...slot, playerId: rename(slot.playerId) })),
        pitcherIds: source.team.pitcherIds.map(rename),
      },
      players: source.players.map((player) => ({
        ...structuredClone(player),
        playerId: rename(player.playerId),
        familyName: familyName + player.familyName,
      })),
      pitches: source.pitches.map((pitch) => ({
        ...structuredClone(pitch),
        pitchId: rename(pitch.pitchId),
        playerId: rename(pitch.playerId),
      })),
    };
  }

  const away = original('away', 'hoshihara-first');
  const home = original('home', 'aonagi-first');
  return structuredClone([
    away,
    home,
    copy(away, 'kohaku', '湖白スワンズ', '湖'),
    copy(home, 'asagiri', '朝霧フォックス', '朝'),
  ]);
}
