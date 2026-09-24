import type { PitchRepertoire } from '../../engine/types.ts';
import { rating } from '../rating.ts';

/** 青凪ハーバーズの全持ち球。球速は0.01km/h、能力はvalueMilli。 */
export const repertoires: PitchRepertoire[] = [
  // player-h-10 / fastball
  {
    pitchId: 'repertoire-player-h-10-fastball',
    playerId: 'player-h-10',
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

  // player-h-10 / slider
  {
    pitchId: 'repertoire-player-h-10-slider',
    playerId: 'player-h-10',
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

  // player-h-10 / fork
  {
    pitchId: 'repertoire-player-h-10-fork',
    playerId: 'player-h-10',
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

  // player-h-11 / fastball
  {
    pitchId: 'repertoire-player-h-11-fastball',
    playerId: 'player-h-11',
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

  // player-h-11 / slider
  {
    pitchId: 'repertoire-player-h-11-slider',
    playerId: 'player-h-11',
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

  // player-h-11 / fork
  {
    pitchId: 'repertoire-player-h-11-fork',
    playerId: 'player-h-11',
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

  // player-h-12 / fastball
  {
    pitchId: 'repertoire-player-h-12-fastball',
    playerId: 'player-h-12',
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

  // player-h-12 / slider
  {
    pitchId: 'repertoire-player-h-12-slider',
    playerId: 'player-h-12',
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

  // player-h-12 / fork
  {
    pitchId: 'repertoire-player-h-12-fork',
    playerId: 'player-h-12',
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
