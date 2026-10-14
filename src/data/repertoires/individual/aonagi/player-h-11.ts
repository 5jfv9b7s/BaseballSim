import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 青凪ハーバーズ / 東野 匠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-h-11-fastball',
    playerId: 'player-h-11',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 79000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2500,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -380,
        heightMm: 1910,
        extensionMm: 1730,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-11-slider',
    playerId: 'player-h-11',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 76000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2600,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: 0,
        yPpm: 0,
        zPpm: 1000000,
      },
      release: {
        lateralMm: -380,
        heightMm: 1910,
        extensionMm: 1730,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-11-fork',
    playerId: 'player-h-11',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 74000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 500,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -380,
        heightMm: 1910,
        extensionMm: 1730,
      },
    },
  },
];
