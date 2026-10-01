import type { GamePlayer } from '../../../game/types.ts';
import { rating } from '../../rating.ts';

/** 追加の架空15選手。能力は既存試作値を複製した未校正の独立入力。 */
export const players: GamePlayer[] = [
  // 寺島 悠 / kohaku-player-a-16
  {
    playerId: 'kohaku-player-a-16',
    familyName: '寺島',
    givenName: '悠',
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

  // 原口 旭 / kohaku-player-a-17
  {
    playerId: 'kohaku-player-a-17',
    familyName: '原口',
    givenName: '旭',
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

  // 小泉 晴人 / kohaku-player-a-18
  {
    playerId: 'kohaku-player-a-18',
    familyName: '小泉',
    givenName: '晴人',
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

  // 岩瀬 奏 / kohaku-player-a-19
  {
    playerId: 'kohaku-player-a-19',
    familyName: '岩瀬',
    givenName: '奏',
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

  // 杉山 透 / kohaku-player-a-20
  {
    playerId: 'kohaku-player-a-20',
    familyName: '杉山',
    givenName: '透',
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

  // 米田 修 / kohaku-player-a-21
  {
    playerId: 'kohaku-player-a-21',
    familyName: '米田',
    givenName: '修',
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

  // 古谷 怜 / kohaku-player-a-22
  {
    playerId: 'kohaku-player-a-22',
    familyName: '古谷',
    givenName: '怜',
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

  // 大森 智 / kohaku-player-a-23
  {
    playerId: 'kohaku-player-a-23',
    familyName: '大森',
    givenName: '智',
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

  // 池上 蒼太 / kohaku-player-a-24
  {
    playerId: 'kohaku-player-a-24',
    familyName: '池上',
    givenName: '蒼太',
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

  // 桜田 渚 / kohaku-player-a-25
  {
    playerId: 'kohaku-player-a-25',
    familyName: '桜田',
    givenName: '渚',
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

  // 藤原 玄 / kohaku-player-a-26
  {
    playerId: 'kohaku-player-a-26',
    familyName: '藤原',
    givenName: '玄',
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

  // 宮内 駿介 / kohaku-player-a-27
  {
    playerId: 'kohaku-player-a-27',
    familyName: '宮内',
    givenName: '駿介',
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

  // 奥村 律希 / kohaku-player-a-28
  {
    playerId: 'kohaku-player-a-28',
    familyName: '奥村',
    givenName: '律希',
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

  // 山川 颯太 / kohaku-player-a-29
  {
    playerId: 'kohaku-player-a-29',
    familyName: '山川',
    givenName: '颯太',
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

  // 花岡 柊 / kohaku-player-a-30
  {
    playerId: 'kohaku-player-a-30',
    familyName: '花岡',
    givenName: '柊',
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
