import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 星原フォックス / 遠山 蓮。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-repertoire-player-a-25-fastball',
    playerId: 'player-a-25',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 63000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2180,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1760,
        extensionMm: 1750,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-a-25-slider',
    playerId: 'player-a-25',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 60000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2280,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: 600000,
        yPpm: 0,
        zPpm: 800000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1760,
        extensionMm: 1750,
      },
    },
  },

  {
    pitchId: 'farm-repertoire-player-a-25-fork',
    playerId: 'player-a-25',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 58000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 530,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1760,
        extensionMm: 1750,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-player-a-25-splitter',
    playerId: 'player-a-25',
    pitchTypeCode: 'splitter',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 58000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13800,
      maxCentiKph: 14300,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 950,
      spinSpreadRpm: 210,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: -280000,
      },
      release: {
        lateralMm: -470,
        heightMm: 1760,
        extensionMm: 1750,
      },
    },
  },
];
