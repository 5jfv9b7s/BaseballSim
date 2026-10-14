import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 星原フォックス / 川瀬 陸。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-a-10-fastball',
    playerId: 'player-a-10',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 76000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2350,
      spinSpreadRpm: 110,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -420,
        heightMm: 1830,
        extensionMm: 1720,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-10-slider',
    playerId: 'player-a-10',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 73000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2450,
      spinSpreadRpm: 110,
      spinAxis: {
        xPpm: 0,
        yPpm: 0,
        zPpm: 1000000,
      },
      release: {
        lateralMm: -420,
        heightMm: 1830,
        extensionMm: 1720,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-10-fork',
    playerId: 'player-a-10',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 71000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 700,
      spinSpreadRpm: 110,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -420,
        heightMm: 1830,
        extensionMm: 1720,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-player-a-10-curve',
    playerId: 'player-a-10',
    pitchTypeCode: 'curve',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 71000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 11800,
      maxCentiKph: 12300,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2500,
      spinSpreadRpm: 110,
      spinAxis: {
        xPpm: 800000,
        yPpm: 0,
        zPpm: 600000,
      },
      release: {
        lateralMm: -420,
        heightMm: 1830,
        extensionMm: 1720,
      },
    },
  },
];
