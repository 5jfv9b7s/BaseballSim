import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 朝花岡 陸。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'asagiri-repertoire-player-h-10-fastball',
    playerId: 'asagiri-player-h-10',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 67000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2120,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -540,
        heightMm: 1730,
        extensionMm: 1830,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-10-slider',
    playerId: 'asagiri-player-h-10',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 64000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2220,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: 600000,
        yPpm: 0,
        zPpm: 800000,
      },
      release: {
        lateralMm: -540,
        heightMm: 1730,
        extensionMm: 1830,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-10-fork',
    playerId: 'asagiri-player-h-10',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 470,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -540,
        heightMm: 1730,
        extensionMm: 1830,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-asagiri-player-h-10-sinker',
    playerId: 'asagiri-player-h-10',
    pitchTypeCode: 'sinker',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13800,
      maxCentiKph: 14300,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 1650,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: -600000,
        yPpm: 0,
        zPpm: -800000,
      },
      release: {
        lateralMm: -540,
        heightMm: 1730,
        extensionMm: 1830,
      },
    },
  },
];
