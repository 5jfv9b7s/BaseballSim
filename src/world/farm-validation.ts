import { ensure, id, integer } from '../engine/validation.ts';
import type { WorldDefinitions } from './types.ts';

/** 二軍の参加数は定数にせず、保存内の参加球団と開催期限を検査する。 */
export function validateFarmDefinitions(definitions: WorldDefinitions): void {
  const farm = definitions.farm;
  ensure(
    farm?.version === 'farm-competition-v1' && farm.statScope === 'farmRegular',
    '二軍大会の版・区分が不正です',
  );
  id(farm.competitionId);
  ensure(farm.competitionId !== definitions.competitionId, '一軍と二軍の大会IDを分けてください');
  integer(farm.benchLimit, 10, 70, '二軍ベンチ上限');
  for (const date of [farm.startDate, farm.endDate]) {
    ensure(
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
      '二軍日程の日付が不正です',
    );
    const time = Date.parse(date + 'T00:00:00Z');
    ensure(
      Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date,
      '二軍日程の日付が不正です',
    );
  }
  ensure(
    farm.startDate >= definitions.startDate &&
      farm.startDate <= farm.endDate &&
      farm.endDate <= definitions.endDate,
    '二軍の開催期間は世界の日程期間内に指定してください',
  );
  ensure(Array.isArray(farm.squads), '二軍の参加情報がありません');
  integer(farm.squads.length, 2, definitions.squads.length, '二軍参加数');
  const identifiers = new Set(
    definitions.squads.flatMap((squad) => [
      squad.squadId,
      squad.team.clubId,
      ...squad.players.map((player) => player.playerId),
      ...squad.pitches.map((pitch) => pitch.pitchId),
    ]),
  );
  const clubs = new Set<string>();
  for (const squad of farm.squads) {
    id(squad.squadId);
    ensure(!identifiers.has(squad.squadId), '二軍IDが重複しています');
    identifiers.add(squad.squadId);
    const club = definitions.squads.find((club) => club.team.clubId === squad.team.clubId);
    ensure(club && !clubs.has(squad.team.clubId), '二軍の球団参照が不正または重複しています');
    clubs.add(squad.team.clubId);
    ensure(
      typeof squad.team.name === 'string' && squad.team.name.trim().length > 0,
      '二軍名が必要です',
    );
    ensure(
      Array.isArray(squad.team.pitcherIds) &&
        squad.team.pitcherIds.length > 0 &&
        new Set(squad.team.pitcherIds).size === squad.team.pitcherIds.length &&
        squad.team.pitcherIds.every((id) => club.team.pitcherIds.includes(id)),
      '二軍の投手参照が不正です',
    );
    ensure(
      Array.isArray(squad.team.lineup) &&
        squad.team.lineup.length === 9 &&
        new Set(squad.team.lineup.map((slot) => slot.playerId)).size === 9 &&
        new Set(squad.team.lineup.map((slot) => slot.position)).size === 9 &&
        squad.team.lineup.every(
          (slot) =>
            ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].includes(slot.position) &&
            club.players.some((player) => player.playerId === slot.playerId) &&
            !club.team.pitcherIds.includes(slot.playerId),
        ),
      '二軍の理想打順・守備が不正です',
    );
  }
}
