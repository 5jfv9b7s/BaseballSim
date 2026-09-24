import type { GamePlayer } from '../../game/types.ts';
import { rating } from '../rating.ts';

/** 湖白スワンズの全15選手。架空・未校正。控えを含め独立した値として編集できます。 */
export const players: GamePlayer[] = [
  // 湖汐見 航 / kohaku-player-a-01
  {
    playerId: 'kohaku-player-a-01',
    familyName: '湖汐見',
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

  // 湖瀬川 律 / kohaku-player-a-02
  {
    playerId: 'kohaku-player-a-02',
    familyName: '湖瀬川',
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

  // 湖朝倉 悠 / kohaku-player-a-03
  {
    playerId: 'kohaku-player-a-03',
    familyName: '湖朝倉',
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

  // 湖風間 颯 / kohaku-player-a-04
  {
    playerId: 'kohaku-player-a-04',
    familyName: '湖風間',
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

  // 湖森岡 蓮 / kohaku-player-a-05
  {
    playerId: 'kohaku-player-a-05',
    familyName: '湖森岡',
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

  // 湖高瀬 湊 / kohaku-player-a-06
  {
    playerId: 'kohaku-player-a-06',
    familyName: '湖高瀬',
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

  // 湖藤崎 直 / kohaku-player-a-07
  {
    playerId: 'kohaku-player-a-07',
    familyName: '湖藤崎',
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

  // 湖小波 蒼 / kohaku-player-a-08
  {
    playerId: 'kohaku-player-a-08',
    familyName: '湖小波',
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

  // 湖夏目 光 / kohaku-player-a-09
  {
    playerId: 'kohaku-player-a-09',
    familyName: '湖夏目',
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

  // 湖川瀬 陸 / kohaku-player-a-10
  {
    playerId: 'kohaku-player-a-10',
    familyName: '湖川瀬',
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

  // 湖羽田 匠 / kohaku-player-a-11
  {
    playerId: 'kohaku-player-a-11',
    familyName: '湖羽田',
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

  // 湖青井 誠 / kohaku-player-a-12
  {
    playerId: 'kohaku-player-a-12',
    familyName: '湖青井',
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

  // 高瀬 陸斗 / kohaku-player-a-13
  {
    playerId: 'kohaku-player-a-13',
    familyName: '高瀬',
    givenName: '陸斗',
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

  // 森岡 律 / kohaku-player-a-14
  {
    playerId: 'kohaku-player-a-14',
    familyName: '森岡',
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

  // 杉浦 晴 / kohaku-player-a-15
  {
    playerId: 'kohaku-player-a-15',
    familyName: '杉浦',
    givenName: '晴',
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
];
