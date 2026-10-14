import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 星原フォックス / 宮原 翼。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-repertoire-player-a-26-fastball',
    playerId: 'player-a-26',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 71000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2280,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -440,
        heightMm: 1800,
        extensionMm: 1780,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-a-26-slider',
    playerId: 'player-a-26',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 68000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2380,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: 0,
        yPpm: 280000,
        zPpm: 960000,
      },
      release: {
        lateralMm: -440,
        heightMm: 1800,
        extensionMm: 1780,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-a-26-fork',
    playerId: 'player-a-26',
    pitchTypeCode: 'fork',
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
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 630,
      spinSpreadRpm: 160,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -440,
        heightMm: 1800,
        extensionMm: 1780,
      },
    },
  },
];
