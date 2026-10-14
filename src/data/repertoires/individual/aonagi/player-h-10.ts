import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 青凪ハーバーズ / 花岡 陸。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-h-10-fastball',
    playerId: 'player-h-10',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 74000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2250,
      spinSpreadRpm: 130,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -460,
        heightMm: 1810,
        extensionMm: 1690,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-10-slider',
    playerId: 'player-h-10',
    pitchTypeCode: 'slider',
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
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2350,
      spinSpreadRpm: 130,
      spinAxis: {
        xPpm: 280000,
        yPpm: 0,
        zPpm: 960000,
      },
      release: {
        lateralMm: -460,
        heightMm: 1810,
        extensionMm: 1690,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-10-fork',
    playerId: 'player-h-10',
    pitchTypeCode: 'fork',
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
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 600,
      spinSpreadRpm: 130,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -460,
        heightMm: 1810,
        extensionMm: 1690,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-player-h-10-changeup',
    playerId: 'player-h-10',
    pitchTypeCode: 'changeup',
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
      typicalCentiKph: 12700,
      maxCentiKph: 13200,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 1250,
      spinSpreadRpm: 130,
      spinAxis: {
        xPpm: -600000,
        yPpm: 0,
        zPpm: -800000,
      },
      release: {
        lateralMm: -460,
        heightMm: 1810,
        extensionMm: 1690,
      },
    },
  },
];
