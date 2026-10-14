import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 桜田 渚。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-fastball',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 60000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2080,
      spinSpreadRpm: 230,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -530,
        heightMm: 1720,
        extensionMm: 1870,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-slider',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2180,
      spinSpreadRpm: 230,
      spinAxis: {
        xPpm: 280000,
        yPpm: 0,
        zPpm: 960000,
      },
      release: {
        lateralMm: -530,
        heightMm: 1720,
        extensionMm: 1870,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-fork',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 55000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 780,
      spinSpreadRpm: 230,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -530,
        heightMm: 1720,
        extensionMm: 1870,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-kohaku-player-a-25-curve',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'curve',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 55000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 11600,
      maxCentiKph: 12100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2230,
      spinSpreadRpm: 230,
      spinAxis: {
        xPpm: 800000,
        yPpm: 0,
        zPpm: 600000,
      },
      release: {
        lateralMm: -530,
        heightMm: 1720,
        extensionMm: 1870,
      },
    },
  },
];
