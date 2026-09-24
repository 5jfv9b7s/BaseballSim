import type { GamePlayer } from '../../game/types.ts';
import { rating } from '../rating.ts';

/** 青凪ハーバーズの全15選手。架空・未校正。控えを含め独立した値として編集できます。 */
export const players: GamePlayer[] = [
  // 星野 航 / player-h-01
  {
    playerId: 'player-h-01',
    familyName: '星野',
    givenName: '航',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(60000),
      contactVsLeft: rating(63000),
      plateDiscipline: rating(55000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(55000),
    fieldingRange: rating(65000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 水原 律 / player-h-02
  {
    playerId: 'player-h-02',
    familyName: '水原',
    givenName: '律',
    throwingHand: 'L',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(67000),
      contactVsLeft: rating(70000),
      plateDiscipline: rating(57000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(65000),
    fieldingRange: rating(73000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 杉浦 悠 / player-h-03
  {
    playerId: 'player-h-03',
    familyName: '杉浦',
    givenName: '悠',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(74000),
      contactVsLeft: rating(77000),
      plateDiscipline: rating(59000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(72000),
    powerVsLeft: rating(72000),
    runningSpeed: rating(75000),
    fieldingRange: rating(81000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(90000),
    },
  },

  // 北見 颯 / player-h-04
  {
    playerId: 'player-h-04',
    familyName: '北見',
    givenName: '颯',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(81000),
      contactVsLeft: rating(84000),
      plateDiscipline: rating(61000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(82000),
    powerVsLeft: rating(81000),
    runningSpeed: rating(85000),
    fieldingRange: rating(65000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(62000),
    },
  },

  // 七瀬 蓮 / player-h-05
  {
    playerId: 'player-h-05',
    familyName: '七瀬',
    givenName: '蓮',
    throwingHand: 'L',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(58000),
      contactVsLeft: rating(61000),
      plateDiscipline: rating(63000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(92000),
    powerVsLeft: rating(90000),
    runningSpeed: rating(55000),
    fieldingRange: rating(73000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(69000),
    },
  },

  // 日高 湊 / player-h-06
  {
    playerId: 'player-h-06',
    familyName: '日高',
    givenName: '湊',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(65000),
      contactVsLeft: rating(68000),
      plateDiscipline: rating(65000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(65000),
    fieldingRange: rating(81000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 春川 直 / player-h-07
  {
    playerId: 'player-h-07',
    familyName: '春川',
    givenName: '直',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(72000),
      contactVsLeft: rating(75000),
      plateDiscipline: rating(67000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(75000),
    fieldingRange: rating(65000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 秋月 蒼 / player-h-08
  {
    playerId: 'player-h-08',
    familyName: '秋月',
    givenName: '蒼',
    throwingHand: 'L',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(79000),
      contactVsLeft: rating(82000),
      plateDiscipline: rating(69000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(72000),
    powerVsLeft: rating(72000),
    runningSpeed: rating(85000),
    fieldingRange: rating(73000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(90000),
    },
  },

  // 若宮 光 / player-h-09
  {
    playerId: 'player-h-09',
    familyName: '若宮',
    givenName: '光',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(86000),
      contactVsLeft: rating(89000),
      plateDiscipline: rating(71000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(82000),
    powerVsLeft: rating(81000),
    runningSpeed: rating(55000),
    fieldingRange: rating(81000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(62000),
    },
  },

  // 花岡 陸 / player-h-10
  {
    playerId: 'player-h-10',
    familyName: '花岡',
    givenName: '陸',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(63000),
      contactVsLeft: rating(66000),
      plateDiscipline: rating(73000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(92000),
    powerVsLeft: rating(90000),
    runningSpeed: rating(65000),
    fieldingRange: rating(65000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(69000),
    },
  },

  // 東野 匠 / player-h-11
  {
    playerId: 'player-h-11',
    familyName: '東野',
    givenName: '匠',
    throwingHand: 'L',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(70000),
      contactVsLeft: rating(73000),
      plateDiscipline: rating(75000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(75000),
    fieldingRange: rating(73000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 西森 誠 / player-h-12
  {
    playerId: 'player-h-12',
    familyName: '西森',
    givenName: '誠',
    throwingHand: 'R',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(77000),
      contactVsLeft: rating(80000),
      plateDiscipline: rating(77000),
    },
    swingAggressionMilli: 63000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(85000),
    fieldingRange: rating(81000),
    armStrength: rating(86000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 藤森 航平 / player-h-13
  {
    playerId: 'player-h-13',
    familyName: '藤森',
    givenName: '航平',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(60000),
      contactVsLeft: rating(63000),
      plateDiscipline: rating(55000),
    },
    swingAggressionMilli: 42000,
    powerVsRight: rating(52000),
    powerVsLeft: rating(54000),
    runningSpeed: rating(55000),
    fieldingRange: rating(65000),
    armStrength: rating(65000),
    fielding: {
      catching: rating(76000),
    },
  },

  // 白石 匠 / player-h-14
  {
    playerId: 'player-h-14',
    familyName: '白石',
    givenName: '匠',
    throwingHand: 'L',
    battingHand: 'R',
    batting: {
      contactVsRight: rating(67000),
      contactVsLeft: rating(70000),
      plateDiscipline: rating(57000),
    },
    swingAggressionMilli: 49000,
    powerVsRight: rating(62000),
    powerVsLeft: rating(63000),
    runningSpeed: rating(65000),
    fieldingRange: rating(73000),
    armStrength: rating(72000),
    fielding: {
      catching: rating(83000),
    },
  },

  // 浅川 樹 / player-h-15
  {
    playerId: 'player-h-15',
    familyName: '浅川',
    givenName: '樹',
    throwingHand: 'R',
    battingHand: 'L',
    batting: {
      contactVsRight: rating(74000),
      contactVsLeft: rating(77000),
      plateDiscipline: rating(59000),
    },
    swingAggressionMilli: 56000,
    powerVsRight: rating(72000),
    powerVsLeft: rating(72000),
    runningSpeed: rating(75000),
    fieldingRange: rating(81000),
    armStrength: rating(79000),
    fielding: {
      catching: rating(90000),
    },
  },
];
