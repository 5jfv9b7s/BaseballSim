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
  '対応球種: ' +
    Object.values(PITCH_TYPES)
      .map((type) => type.name)
      .join('、'),
);
