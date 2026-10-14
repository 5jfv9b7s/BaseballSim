import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 青凪ハーバーズ / 飯田 仁。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-repertoire-player-h-25-fastball',
    playerId: 'player-h-25',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 72000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2380,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -410,
        heightMm: 1850,
        extensionMm: 1760,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-h-25-slider',
    playerId: 'player-h-25',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 69000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2480,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: 0,
        yPpm: 600000,
        zPpm: 800000,
      },
      release: {
        lateralMm: -410,
        heightMm: 1850,
        extensionMm: 1760,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-h-25-fork',
    playerId: 'player-h-25',
    pitchTypeCode: 'fork',
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
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 730,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -410,
        heightMm: 1850,
        extensionMm: 1760,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-player-h-25-sweeper',
    playerId: 'player-h-25',
    pitchTypeCode: 'sweeper',
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
      typicalCentiKph: 13000,
      maxCentiKph: 13500,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2750,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: 280000,
        yPpm: 0,
        zPpm: 960000,
      },
      release: {
        lateralMm: -410,
        heightMm: 1850,
        extensionMm: 1760,
      },
    },
  },
];
