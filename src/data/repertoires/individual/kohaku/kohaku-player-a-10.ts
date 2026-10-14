import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 湖川瀬 陸。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'kohaku-repertoire-player-a-10-fastball',
    playerId: 'kohaku-player-a-10',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 78000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2400,
      spinSpreadRpm: 120,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -400,
        heightMm: 1870,
        extensionMm: 1740,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-10-slider',
    playerId: 'kohaku-player-a-10',
    pitchTypeCode: 'slider',
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
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2500,
      spinSpreadRpm: 120,
      spinAxis: {
        xPpm: 0,
        yPpm: 600000,
        zPpm: 800000,
      },
      release: {
        lateralMm: -400,
        heightMm: 1870,
        extensionMm: 1740,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-10-fork',
    playerId: 'kohaku-player-a-10',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 73000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 750,
      spinSpreadRpm: 120,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -400,
        heightMm: 1870,
        extensionMm: 1740,
      },
    },
  },

  {
    pitchId: 'profile-repertoire-kohaku-player-a-10-cutter',
    playerId: 'kohaku-player-a-10',
    pitchTypeCode: 'cutter',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 52000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 73000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14200,
      maxCentiKph: 14700,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2400,
      spinSpreadRpm: 120,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: 600000,
      },
      release: {
        lateralMm: -400,
        heightMm: 1870,
        extensionMm: 1740,
      },
    },
  },
];
