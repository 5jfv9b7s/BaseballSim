import type { GamePlayer } from '../../game/types.ts';
import { rating } from '../rating.ts';

/** 朝霧フォックスの全15選手。架空・未校正。控えを含め独立した値として編集できます。 */
export const players: GamePlayer[] = [
  // 朝星野 航 / asagiri-player-h-01
  {
    playerId: 'asagiri-player-h-01',
    familyName: '朝星野',
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

  // 朝水原 律 / asagiri-player-h-02
  {
    playerId: 'asagiri-player-h-02',
    familyName: '朝水原',
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

  // 朝杉浦 悠 / asagiri-player-h-03
  {
    playerId: 'asagiri-player-h-03',
    familyName: '朝杉浦',
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

  // 朝北見 颯 / asagiri-player-h-04
  {
    playerId: 'asagiri-player-h-04',
    familyName: '朝北見',
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

  // 朝七瀬 蓮 / asagiri-player-h-05
  {
    playerId: 'asagiri-player-h-05',
    familyName: '朝七瀬',
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

  // 朝日高 湊 / asagiri-player-h-06
  {
    playerId: 'asagiri-player-h-06',
    familyName: '朝日高',
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

  // 朝春川 直 / asagiri-player-h-07
  {
    playerId: 'asagiri-player-h-07',
    familyName: '朝春川',
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

  // 朝秋月 蒼 / asagiri-player-h-08
  {
    playerId: 'asagiri-player-h-08',
    familyName: '朝秋月',
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

  // 朝若宮 光 / asagiri-player-h-09
  {
    playerId: 'asagiri-player-h-09',
    familyName: '朝若宮',
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

  // 朝花岡 陸 / asagiri-player-h-10
  {
    playerId: 'asagiri-player-h-10',
    familyName: '朝花岡',
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

  // 朝東野 匠 / asagiri-player-h-11
  {
    playerId: 'asagiri-player-h-11',
    familyName: '朝東野',
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

  // 朝西森 誠 / asagiri-player-h-12
  {
    playerId: 'asagiri-player-h-12',
    familyName: '朝西森',
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

  // 春日 颯太 / asagiri-player-h-13
  {
    playerId: 'asagiri-player-h-13',
    familyName: '春日',
    givenName: '颯太',
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

  // 水野 拓 / asagiri-player-h-14
  {
    playerId: 'asagiri-player-h-14',
    familyName: '水野',
    givenName: '拓',
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

  // 高原 慧 / asagiri-player-h-15
  {
    playerId: 'asagiri-player-h-15',
    familyName: '高原',
    givenName: '慧',
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
