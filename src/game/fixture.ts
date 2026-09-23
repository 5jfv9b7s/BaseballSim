import type { Ability, PitchRepertoire } from '../engine/types.ts';
import { ensure } from '../engine/validation.ts';
import type { GameFixture, GamePlayer, Position, Team, TeamSide } from './types.ts';
import { GAME_MODEL } from './model.ts';

const ability = (valueMilli: number): Ability => ({ valueMilli, ceilingMilli: 110000 });

export function createGameFixture(): GameFixture {
  const players: GamePlayer[] = [];
  const pitches: PitchRepertoire[] = [];
  const teams = {} as Record<TeamSide, Team>;
  // 名前・打順を変更してもIDを再採番しない、固定の架空名簿。
  const rosters = {
    away: [
      ['player-a-01', '汐見', '航'],
      ['player-a-02', '瀬川', '律'],
      ['player-a-03', '朝倉', '悠'],
      ['player-a-04', '風間', '颯'],
      ['player-a-05', '森岡', '蓮'],
      ['player-a-06', '高瀬', '湊'],
      ['player-a-07', '藤崎', '直'],
      ['player-a-08', '小波', '蒼'],
      ['player-a-09', '夏目', '光'],
      ['player-a-10', '川瀬', '陸'],
      ['player-a-11', '羽田', '匠'],
      ['player-a-12', '青井', '誠'],
    ],
    home: [
      ['player-h-01', '星野', '航'],
      ['player-h-02', '水原', '律'],
      ['player-h-03', '杉浦', '悠'],
      ['player-h-04', '北見', '颯'],
      ['player-h-05', '七瀬', '蓮'],
      ['player-h-06', '日高', '湊'],
      ['player-h-07', '春川', '直'],
      ['player-h-08', '秋月', '蒼'],
      ['player-h-09', '若宮', '光'],
      ['player-h-10', '花岡', '陸'],
      ['player-h-11', '東野', '匠'],
      ['player-h-12', '西森', '誠'],
    ],
  } as const;
  const positions: Exclude<Position, 'P'>[] = ['CF', 'SS', 'RF', 'DH', '1B', 'LF', '3B', 'C', '2B'];

  for (const [sideIndex, side] of (['away', 'home'] as const).entries()) {
    const roster: string[] = [];
    for (const [i, [id, familyName, givenName]] of rosters[side].entries()) {
      const contact = 57000 + ((i * 7 + sideIndex * 3) % 30) * 1000;
      roster.push(id);
      players.push({
        playerId: id,
        familyName,
        givenName,
        throwingHand: i % 3 === 1 ? 'L' : 'R',
        battingHand: i % 2 === 0 ? 'L' : 'R',
        batting: {
          contactVsRight: ability(contact),
          contactVsLeft: ability(contact + 3000),
          plateDiscipline: ability(55000 + i * 2000),
        },
        swingAggressionMilli: 42000 + (i % 4) * 7000,
        powerVsRight: ability(52000 + (i % 5) * 10000),
        powerVsLeft: ability(54000 + (i % 5) * 9000),
        runningSpeed: ability(55000 + (i % 4) * 10000),
        fieldingRange: ability(65000 + (i % 3) * 8000),
        armStrength: ability(65000 + (i % 4) * 7000),
      });
      if (i >= 9) {
        for (const [j, type] of (['fastball', 'slider', 'fork'] as const).entries()) {
          const speed = [14600, 13300, 13600][j]! + (i - 9) * 150;
          pitches.push({
            pitchId: `repertoire-${id}-${type}`,
            playerId: id,
            pitchTypeCode: type,
            acquisitionProgressMilli: 100000,
            control: ability(52000 + (i - 9) * 5000),
            repeatability: ability(70000),
            velocity: { typicalCentiKph: speed, maxCentiKph: speed + 500, spreadCentiKph: 450 },
          });
        }
      }
    }
    teams[side] = {
      side,
      clubId: side === 'home' ? 'club-h' : 'club-a',
      name: side === 'home' ? '青凪ハーバーズ' : '星原フォックス',
      lineup: roster.slice(0, 9).map((playerId, i) => ({ playerId, position: positions[i]! })),
      pitcherIds: roster.slice(9),
    };
  }
  return {
    initialDatasetVersion: GAME_MODEL.datasetVersion,
    players,
    pitches,
    teams,
    clubs: (['away', 'home'] as const).map((side) => ({
      clubId: teams[side].clubId,
      name: teams[side].name,
      playerIds: [...teams[side].lineup.map((p) => p.playerId), ...teams[side].pitcherIds],
    })),
  };
}

export function getPlayer(fixture: GameFixture, playerId: string): GamePlayer {
  const player = fixture.players.find((p) => p.playerId === playerId);
  ensure(player, '選手IDの参照が不正です');
  return player;
}

export function playerName(fixture: GameFixture, playerId: string): string {
  const p = getPlayer(fixture, playerId);
  return `${p.familyName} ${p.givenName}`;
}
