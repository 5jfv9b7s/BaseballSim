import type { GamePlayer } from '../../../game/types.ts';
import { rating } from '../../rating.ts';

/** 追加の架空15選手。能力は既存試作値を複製した未校正の独立入力。 */
export const players: GamePlayer[] = [
  // 水野 翔 / player-a-16
  {
    playerId: 'player-a-16',
    familyName: '水野',
    givenName: '翔',
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

  // 石渡 晴 / player-a-17
  {
    playerId: 'player-a-17',
    familyName: '石渡',
    givenName: '晴',
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

  // 片桐 颯 / player-a-18
  {
    playerId: 'player-a-18',
    familyName: '片桐',
    givenName: '颯',
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

  // 安藤 匠 / player-a-19
  {
    playerId: 'player-a-19',
    familyName: '安藤',
    givenName: '匠',
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

  // 松浦 司 / player-a-20
  {
    playerId: 'player-a-20',
    familyName: '松浦',
    givenName: '司',
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

  // 永井 迅 / player-a-21
  {
    playerId: 'player-a-21',
    familyName: '永井',
    givenName: '迅',
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

  // 坂口 陸 / player-a-22
  {
    playerId: 'player-a-22',
    familyName: '坂口',
    givenName: '陸',
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

  // 平井 渉 / player-a-23
  {
    playerId: 'player-a-23',
    familyName: '平井',
    givenName: '渉',
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

  // 成田 悠真 / player-a-24
  {
    playerId: 'player-a-24',
    familyName: '成田',
    givenName: '悠真',
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

  // 遠山 蓮 / player-a-25
  {
    playerId: 'player-a-25',
    familyName: '遠山',
    givenName: '蓮',
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

  // 宮原 翼 / player-a-26
  {
    playerId: 'player-a-26',
    familyName: '宮原',
    givenName: '翼',
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

  // 木崎 蒼 / player-a-27
  {
    playerId: 'player-a-27',
    familyName: '木崎',
    givenName: '蒼',
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

  // 山岸 海 / player-a-28
  {
    playerId: 'player-a-28',
    familyName: '山岸',
    givenName: '海',
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

  // 岡野 律 / player-a-29
  {
    playerId: 'player-a-29',
    familyName: '岡野',
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

  // 大原 湊 / player-a-30
  {
    playerId: 'player-a-30',
    familyName: '大原',
    givenName: '湊',
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
