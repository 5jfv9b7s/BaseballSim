import { createWorld, createAnnualWorld, createRosterWorld } from '../src/world/engine.ts';
import { createGame } from '../src/game/engine.ts';
import { PITCH_TYPES } from '../src/data/pitch-types/index.ts';

// 試合を開始できる名簿か検査する。計算・保存・既存データの書換えは行わない。
const { fixture } = createGame();
console.log('新規試合データの検査に成功しました。');
for (const side of ['away', 'home'] as const) {
  const team = fixture.teams[side];
  console.log(`${team.name}: 打順${team.lineup.length}人 / 投手${team.pitcherIds.length}人`);
}
console.log(`選手${fixture.players.length}人 / 持ち球${fixture.pitches.length}件`);
console.log(
  '表示辞書の球種（計算対応とは別）: ' +
    Object.values(PITCH_TYPES)
      .map((type) => type.name)
      .join('、'),
);

const world = createWorld();
console.log('現行モデルの計算対応: ストレート、スライダー、フォーク');
console.log(
  '日次データ: ' +
    world.definitions.squads.length +
    '球団 / ' +
    world.definitions.squads.reduce((sum, squad) => sum + squad.players.length, 0) +
    '選手 / ' +
    world.definitions.schedule.length +
    '試合（検査成功）',
);

const annual = createAnnualWorld();
console.log(
  '年間日程: ' +
    annual.definitions.schedule.length +
    '試合 / ' +
    annual.definitions.startDate +
    '〜' +
    annual.definitions.endDate +
    '（検査成功）',
);

const roster = createRosterWorld();
console.log(
  '控え対応名簿: ' +
    roster.definitions.squads.reduce((sum, squad) => sum + squad.players.length, 0) +
    '選手（検査成功）',
);
