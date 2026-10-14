import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 青凪ハーバーズ / 西森 誠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'repertoire-player-h-12-fastball',
    playerId: 'player-h-12',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2050,
      spinSpreadRpm: 220,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -560,
        heightMm: 1700,
        extensionMm: 1850,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-12-slider',
    playerId: 'player-h-12',
    pitchTypeCode: 'slider',
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
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2150,
      spinSpreadRpm: 220,
      spinAxis: {
        xPpm: 600000,
        yPpm: 0,
        zPpm: 800000,
      },
      release: {
        lateralMm: -560,
        heightMm: 1700,
        extensionMm: 1850,
      },
    },
  },

  {
    pitchId: 'repertoire-player-h-12-fork',
    playerId: 'player-h-12',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 750,
      spinSpreadRpm: 220,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -560,
        heightMm: 1700,
        extensionMm: 1850,
      },
    },
  },
];
