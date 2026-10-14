import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 湖青井 誠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'kohaku-repertoire-player-a-12-fastball',
    playerId: 'kohaku-player-a-12',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 80000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2550,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -370,
        heightMm: 1920,
        extensionMm: 1660,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-12-slider',
    playerId: 'kohaku-player-a-12',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 77000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2650,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: 0,
        yPpm: 0,
        zPpm: 1000000,
      },
      release: {
        lateralMm: -370,
        heightMm: 1920,
        extensionMm: 1660,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-12-fork',
    playerId: 'kohaku-player-a-12',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 75000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 550,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -370,
        heightMm: 1920,
        extensionMm: 1660,
      },
    },
  },
];
