import type { PitchRepertoire } from '../../../engine/types.ts';
import { rating } from '../../rating.ts';

/** 追加投手3人の独立した持ち球。球速は0.01km/h、能力はvalueMilli。 */
export const repertoires: PitchRepertoire[] = [
  // kohaku-player-a-25 / fastball
  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-fastball',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 14600,
      maxCentiKph: 15100,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-25 / slider
  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-slider',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13300,
      maxCentiKph: 13800,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-25 / fork
  {
    pitchId: 'farm-kohaku-repertoire-player-a-10-fork',
    playerId: 'kohaku-player-a-25',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: rating(52000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-26 / fastball
  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-fastball',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: rating(57000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 14750,
      maxCentiKph: 15250,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-26 / slider
  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-slider',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: rating(57000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13450,
      maxCentiKph: 13950,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-26 / fork
  {
    pitchId: 'farm-kohaku-repertoire-player-a-11-fork',
    playerId: 'kohaku-player-a-26',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: rating(57000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13750,
      maxCentiKph: 14250,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-27 / fastball
  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-fastball',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'fastball',
    acquisitionProgressMilli: 100000,
    control: rating(62000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 14900,
      maxCentiKph: 15400,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-27 / slider
  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-slider',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'slider',
    acquisitionProgressMilli: 100000,
    control: rating(62000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13600,
      maxCentiKph: 14100,
      spreadCentiKph: 450,
    },
  },

  // kohaku-player-a-27 / fork
  {
    pitchId: 'farm-kohaku-repertoire-player-a-12-fork',
    playerId: 'kohaku-player-a-27',
    pitchTypeCode: 'fork',
    acquisitionProgressMilli: 100000,
    control: rating(62000),
    repeatability: rating(70000),
    velocity: {
      typicalCentiKph: 13900,
      maxCentiKph: 14400,
      spreadCentiKph: 450,
    },
  },
];
