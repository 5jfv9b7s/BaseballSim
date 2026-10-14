import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 青凪ハーバーズ / 中原 朔。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-repertoire-player-h-26-fastball',
    playerId: 'player-h-26',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 66000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2150,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -490,
        heightMm: 1770,
        extensionMm: 1790,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-h-26-slider',
    playerId: 'player-h-26',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 63000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2250,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: 0,
        yPpm: 280000,
        zPpm: 960000,
      },
      release: {
        lateralMm: -490,
        heightMm: 1770,
        extensionMm: 1790,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-h-26-fork',
    playerId: 'player-h-26',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 61000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 500,
      spinSpreadRpm: 200,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -490,
        heightMm: 1770,
        extensionMm: 1790,
      },
    },
  },
];
