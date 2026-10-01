import type { GamePlayer } from '../../../game/types.ts';
import { rating } from '../../rating.ts';

/** 追加の架空15選手。能力は既存試作値を複製した未校正の独立入力。 */
export const players: GamePlayer[] = [
  // 川原 湊人 / asagiri-player-h-16
  {
    playerId: 'asagiri-player-h-16',
    familyName: '川原',
    givenName: '湊人',
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

  // 水谷 健 / asagiri-player-h-17
  {
    playerId: 'asagiri-player-h-17',
    familyName: '水谷',
    givenName: '健',
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

  // 平岡 光 / asagiri-player-h-18
  {
    playerId: 'asagiri-player-h-18',
    familyName: '平岡',
    givenName: '光',
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

  // 梶原 優 / asagiri-player-h-19
  {
    playerId: 'asagiri-player-h-19',
    familyName: '梶原',
    givenName: '優',
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

  // 石橋 翔太 / asagiri-player-h-20
  {
    playerId: 'asagiri-player-h-20',
    familyName: '石橋',
    givenName: '翔太',
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

  // 堀内 悠斗 / asagiri-player-h-21
  {
    playerId: 'asagiri-player-h-21',
    familyName: '堀内',
    givenName: '悠斗',
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

  // 柳原 蓮斗 / asagiri-player-h-22
  {
    playerId: 'asagiri-player-h-22',
    familyName: '柳原',
    givenName: '蓮斗',
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

  // 森川 岳人 / asagiri-player-h-23
  {
    playerId: 'asagiri-player-h-23',
    familyName: '森川',
    givenName: '岳人',
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

  // 内山 奏太 / asagiri-player-h-24
  {
    playerId: 'asagiri-player-h-24',
    familyName: '内山',
    givenName: '奏太',
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

  // 白川 仁志 / asagiri-player-h-25
  {
    playerId: 'asagiri-player-h-25',
    familyName: '白川',
    givenName: '仁志',
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

  // 新井 圭 / asagiri-player-h-26
  {
    playerId: 'asagiri-player-h-26',
    familyName: '新井',
    givenName: '圭',
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

  // 小田 迅人 / asagiri-player-h-27
  {
    playerId: 'asagiri-player-h-27',
    familyName: '小田',
    givenName: '迅人',
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

  // 黒田 遼太 / asagiri-player-h-28
  {
    playerId: 'asagiri-player-h-28',
    familyName: '黒田',
    givenName: '遼太',
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

  // 夏川 司 / asagiri-player-h-29
  {
    playerId: 'asagiri-player-h-29',
    familyName: '夏川',
    givenName: '司',
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

  // 村瀬 陽介 / asagiri-player-h-30
  {
    playerId: 'asagiri-player-h-30',
    familyName: '村瀬',
    givenName: '陽介',
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
