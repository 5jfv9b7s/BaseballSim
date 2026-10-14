import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 朝西森 誠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'asagiri-repertoire-player-h-12-fastball',
    playerId: 'asagiri-player-h-12',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 72000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2280,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1790,
        extensionMm: 1780,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-12-slider',
    playerId: 'asagiri-player-h-12',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
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
      spinRateRpm: 2380,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: 280000,
        yPpm: 0,
        zPpm: 960000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1790,
        extensionMm: 1780,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-12-fork',
    playerId: 'asagiri-player-h-12',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 62000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 67000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 630,
      spinSpreadRpm: 170,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1790,
        extensionMm: 1780,
      },
    },
  },
];
