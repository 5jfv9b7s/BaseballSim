import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 宮内 駿介。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-fastball',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 64000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2180,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -500,
        heightMm: 1750,
        extensionMm: 1800,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-slider',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 61000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2280,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: 0,
        yPpm: 600000,
        zPpm: 800000,
      },
      release: {
        lateralMm: -500,
        heightMm: 1750,
        extensionMm: 1800,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-fork',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 59000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 530,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -500,
        heightMm: 1750,
        extensionMm: 1800,
      },
    },
  },
];
