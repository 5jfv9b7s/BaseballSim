import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 星原フォックス / 青井 誠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-a-12-fastball',
    playerId: 'player-a-12',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 81000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2450,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -390,
        heightMm: 1880,
        extensionMm: 1680,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-12-slider',
    playerId: 'player-a-12',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 78000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2550,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: 0,
        yPpm: 600000,
        zPpm: 800000,
      },
      release: {
        lateralMm: -390,
        heightMm: 1880,
        extensionMm: 1680,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-12-fork',
    playerId: 'player-a-12',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 76000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 450,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -390,
        heightMm: 1880,
        extensionMm: 1680,
      },
    },
  },
];
