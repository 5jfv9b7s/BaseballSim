import type { GamePlayer } from '../../game/types.ts';
import { rating } from '../rating.ts';

/** 星原フォックスの架空選手。IDは改名・並べ替えでも維持します。 */
export const players: GamePlayer[] = [
  // 汐見 航
  {
    playerId: 'player-a-01',
    familyName: '汐見',
    givenName: '航',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(57000),
      contactVsLeft: rating(60000),
      plateDiscipline: rating(55000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(55000),
    fieldingRange: rating(65000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(62000),
    },
  },

  // 瀬川 律
  {
    playerId: 'player-a-02',
    familyName: '瀬川',
    givenName: '律',
    throwingHand: 'L',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(64000),
      contactVsLeft: rating(67000),
      plateDiscipline: rating(57000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(65000),
    fieldingRange: rating(73000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(69000),
    },
  },

  // 朝倉 悠
  {
    playerId: 'player-a-03',
    familyName: '朝倉',
    givenName: '悠',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(71000),
      contactVsLeft: rating(74000),
      plateDiscipline: rating(59000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(72000),
    powerVsLeft: rating(72000),
    runningSpeed: rating(75000),
    fieldingRange: rating(81000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 風間 颯
  {
    playerId: 'player-a-04',
    familyName: '風間',
    givenName: '颯',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(78000),
      contactVsLeft: rating(81000),
      plateDiscipline: rating(61000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(82000),
    powerVsLeft: rating(81000),
    runningSpeed: rating(85000),
    fieldingRange: rating(65000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 森岡 蓮
  {
    playerId: 'player-a-05',
    familyName: '森岡',
    givenName: '蓮',
    throwingHand: 'L',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(85000),
      contactVsLeft: rating(88000),
      plateDiscipline: rating(63000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(92000),
    powerVsLeft: rating(90000),
    runningSpeed: rating(55000),
    fieldingRange: rating(73000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(90000),
    },
  },

  // 高瀬 湊
  {
    playerId: 'player-a-06',
    familyName: '高瀬',
    givenName: '湊',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(62000),
      contactVsLeft: rating(65000),
      plateDiscipline: rating(65000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(65000),
    fieldingRange: rating(81000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(62000),
    },
  },

  // 藤崎 直
  {
    playerId: 'player-a-07',
    familyName: '藤崎',
    givenName: '直',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(69000),
      contactVsLeft: rating(72000),
      plateDiscipline: rating(67000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(75000),
    fieldingRange: rating(65000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(69000),
    },
  },

  // 小波 蒼
  {
    playerId: 'player-a-08',
    familyName: '小波',
    givenName: '蒼',
    throwingHand: 'L',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(76000),
      contactVsLeft: rating(79000),
      plateDiscipline: rating(69000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(72000),
    powerVsLeft: rating(72000),
    runningSpeed: rating(85000),
    fieldingRange: rating(73000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 夏目 光
  {
    playerId: 'player-a-09',
    familyName: '夏目',
    givenName: '光',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(83000),
      contactVsLeft: rating(86000),
      plateDiscipline: rating(71000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(82000),
    powerVsLeft: rating(81000),
    runningSpeed: rating(55000),
    fieldingRange: rating(81000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 川瀬 陸
  {
    playerId: 'player-a-10',
    familyName: '川瀬',
    givenName: '陸',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(60000),
      contactVsLeft: rating(63000),
      plateDiscipline: rating(73000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(92000),
    powerVsLeft: rating(90000),
    runningSpeed: rating(65000),
    fieldingRange: rating(65000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(90000),
    },
  },

  // 羽田 匠
  {
    playerId: 'player-a-11',
    familyName: '羽田',
    givenName: '匠',
    throwingHand: 'L',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(67000),
      contactVsLeft: rating(70000),
      plateDiscipline: rating(75000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(75000),
    fieldingRange: rating(73000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(62000),
    },
  },

  // 青井 誠
  {
    playerId: 'player-a-12',
    familyName: '青井',
    givenName: '誠',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(74000),
      contactVsLeft: rating(77000),
      plateDiscipline: rating(77000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(85000),
    fieldingRange: rating(81000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(69000),
    },
  },
];
