import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 朝東野 匠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'asagiri-repertoire-player-h-11-fastball',
    playerId: 'asagiri-player-h-11',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 77000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2420,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -410,
        heightMm: 1860,
        extensionMm: 1700,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-11-slider',
    playerId: 'asagiri-player-h-11',
    pitchTypeCode: 'slider',
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
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2520,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: 0,
        yPpm: 600000,
        zPpm: 800000,
      },
      release: {
        lateralMm: -410,
        heightMm: 1860,
        extensionMm: 1700,
      },
    },
  },

  {
    pitchId: 'asagiri-repertoire-player-h-11-fork',
    playerId: 'asagiri-player-h-11',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 72000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 770,
      spinSpreadRpm: 140,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -410,
        heightMm: 1860,
        extensionMm: 1700,
      },
    },
  },
];
