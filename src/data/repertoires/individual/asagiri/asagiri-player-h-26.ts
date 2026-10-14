import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 新井 圭。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-asagiri-repertoire-player-h-11-fastball',
    playerId: 'asagiri-player-h-26',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 59000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2050,
      spinSpreadRpm: 240,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -570,
        heightMm: 1690,
        extensionMm: 1880,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-11-slider',
    playerId: 'asagiri-player-h-26',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 56000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2150,
      spinSpreadRpm: 240,
      spinAxis: {
        xPpm: 0,
        yPpm: 280000,
        zPpm: 960000,
      },
      release: {
        lateralMm: -570,
        heightMm: 1690,
        extensionMm: 1880,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-11-fork',
    playerId: 'asagiri-player-h-26',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 54000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 750,
      spinSpreadRpm: 240,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -570,
        heightMm: 1690,
        extensionMm: 1880,
      },
    },
  },
];
