import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 朝霧フォックス / 白川 仁志。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-asagiri-repertoire-player-h-10-fastball',
    playerId: 'asagiri-player-h-25',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 75000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2520,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -360,
        heightMm: 1900,
        extensionMm: 1670,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-10-slider',
    playerId: 'asagiri-player-h-25',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 72000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2620,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: 0,
        yPpm: 0,
        zPpm: 1000000,
      },
      release: {
        lateralMm: -360,
        heightMm: 1900,
        extensionMm: 1670,
      },
    },
  },

  {
    pitchId: 'farm-asagiri-repertoire-player-h-10-fork',
    playerId: 'asagiri-player-h-25',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 70000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 520,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: -1000000,
        yPpm: 0,
        zPpm: 0,
      },
      release: {
        lateralMm: -360,
        heightMm: 1900,
        extensionMm: 1670,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-asagiri-player-h-25-changeup',
    playerId: 'asagiri-player-h-25',
    pitchTypeCode: 'changeup',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 70000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 12400,
      maxCentiKph: 12900,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 1250,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: -600000,
        yPpm: 0,
        zPpm: -800000,
      },
      release: {
        lateralMm: -360,
        heightMm: 1900,
        extensionMm: 1670,
      },
    },
  },
];
