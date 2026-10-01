import type { GamePlayer } from '../../../game/types.ts';
import { rating } from '../../rating.ts';

/** 追加の架空15選手。能力は既存試作値を複製した未校正の独立入力。 */
export const players: GamePlayer[] = [
  // 吉野 駿 / player-h-16
  {
    playerId: 'player-h-16',
    familyName: '吉野',
    givenName: '駿',
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

  // 西岡 航 / player-h-17
  {
    playerId: 'player-h-17',
    familyName: '西岡',
    givenName: '航',
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

  // 藤沢 樹 / player-h-18
  {
    playerId: 'player-h-18',
    familyName: '藤沢',
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

  // 柴崎 岳 / player-h-19
  {
    playerId: 'player-h-19',
    familyName: '柴崎',
    givenName: '岳',
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

  // 小西 遼 / player-h-20
  {
    playerId: 'player-h-20',
    familyName: '小西',
    givenName: '遼',
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

  // 石原 直 / player-h-21
  {
    playerId: 'player-h-21',
    familyName: '石原',
    givenName: '直',
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

  // 田辺 薫 / player-h-22
  {
    playerId: 'player-h-22',
    familyName: '田辺',
    givenName: '薫',
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

  // 福原 陽 / player-h-23
  {
    playerId: 'player-h-23',
    familyName: '福原',
    givenName: '陽',
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

  // 榊原 凪 / player-h-24
  {
    playerId: 'player-h-24',
    familyName: '榊原',
    givenName: '凪',
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

  // 飯田 仁 / player-h-25
  {
    playerId: 'player-h-25',
    familyName: '飯田',
    givenName: '仁',
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

  // 中原 朔 / player-h-26
  {
    playerId: 'player-h-26',
    familyName: '中原',
    givenName: '朔',
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

  // 長尾 結 / player-h-27
  {
    playerId: 'player-h-27',
    familyName: '長尾',
    givenName: '結',
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

  // 竹下 碧 / player-h-28
  {
    playerId: 'player-h-28',
    familyName: '竹下',
    givenName: '碧',
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

  // 浅田 望 / player-h-29
  {
    playerId: 'player-h-29',
    familyName: '浅田',
    givenName: '望',
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

  // 相沢 玲 / player-h-30
  {
    playerId: 'player-h-30',
    familyName: '相沢',
    givenName: '玲',
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
