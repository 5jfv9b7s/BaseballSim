import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 湖羽田 匠。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'kohaku-repertoire-player-a-11-fastball',
    playerId: 'kohaku-player-a-11',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 70000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2200,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: -800000,
        yPpm: 600000,
        zPpm: 0,
      },
      release: {
        lateralMm: -480,
        heightMm: 1780,
        extensionMm: 1820,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-11-slider',
    playerId: 'kohaku-player-a-11',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 67000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2300,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: 0,
        yPpm: 280000,
        zPpm: 960000,
      },
      release: {
        lateralMm: -480,
        heightMm: 1780,
        extensionMm: 1820,
      },
    },
  },

  {
    pitchId: 'kohaku-repertoire-player-a-11-fork',
    playerId: 'kohaku-player-a-11',
    pitchTypeCode: 'fork',
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
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 550,
      spinSpreadRpm: 180,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -480,
        heightMm: 1780,
        extensionMm: 1820,
      },
    },
  },
];
