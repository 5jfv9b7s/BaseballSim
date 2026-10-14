import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 星原フォックス / 羽田 匠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-a-11-fastball',
    playerId: 'player-a-11',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 65000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2100,
      spinSpreadRpm: 190,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -510,
        heightMm: 1740,
        extensionMm: 1810,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-11-slider',
    playerId: 'player-a-11',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2200,
      spinSpreadRpm: 190,
      spinAxis: {
        xPpm: 280000,
        yPpm: 0,
        zPpm: 960000,
      },
      release: {
        lateralMm: -510,
        heightMm: 1740,
        extensionMm: 1810,
      },
    },
  },

  {
    pitchId: 'repertoire-player-a-11-fork',
    playerId: 'player-a-11',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 60000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 450,
      spinSpreadRpm: 190,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -510,
        heightMm: 1740,
        extensionMm: 1810,
      },
    },
  },
];
