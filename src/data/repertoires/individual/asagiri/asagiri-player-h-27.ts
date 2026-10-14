import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 小田 迅人。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-asagiri-repertoire-player-h-12-fastball',
    playerId: 'asagiri-player-h-27',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 71000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2350,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -440,
        heightMm: 1840,
        extensionMm: 1750,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-12-slider',
    playerId: 'asagiri-player-h-27',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 68000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2450,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: 600000,
        yPpm: 0,
        zPpm: 800000,
      },
      release: {
        lateralMm: -440,
        heightMm: 1840,
        extensionMm: 1750,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-12-fork',
    playerId: 'asagiri-player-h-27',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 66000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 700,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -440,
        heightMm: 1840,
        extensionMm: 1750,
      },
    },
  },
];
