import type { PitchRepertoire } from '../../../../engine/types.ts';

/** 湖白スワンズ / 藤原 玄。未校正の架空値。 */
// 軸・リリース左右は右投手基準。左投手の反転はエンジンが行う。
export const repertoires: PitchRepertoire[] = [
  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-fastball',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: {
      valueMilli: 57000,
      ceilingMilli: 110000,
    },
    repeatability: {
      valueMilli: 73000,
      ceilingMilli: 110000,
    },
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2300,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: -800000,
        yPpm: 0,
        zPpm: -600000,
      },
      release: {
        lateralMm: -450,
        heightMm: 1800,
        extensionMm: 1770,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-slider',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'slider',
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
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 2400,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: 600000,
        yPpm: 0,
        zPpm: 800000,
      },
      release: {
        lateralMm: -450,
        heightMm: 1800,
        extensionMm: 1770,
      },
    },
  },

  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-fork',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'fork',
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
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
    delivery: {
      spinRateRpm: 650,
      spinSpreadRpm: 150,
      spinAxis: {
        xPpm: -960000,
        yPpm: 0,
        zPpm: 280000,
      },
      release: {
        lateralMm: -450,
        heightMm: 1800,
        extensionMm: 1770,
      },
    },
  },
];
