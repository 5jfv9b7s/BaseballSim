import { createFielderRestWorld } from '../src/world/engine.ts';
import { createFielderRestDefinitions } from '../src/data/world/fielder-rest.ts';
import { createPerformanceWorld } from '../src/world/engine.ts';
import { createPerformanceDefinitions } from '../src/data/world/performance.ts';
import { createConditionWorld } from '../src/world/engine.ts';
import { createConditionDefinitions } from '../src/data/world/condition.ts';
import { createRestWorld } from '../src/world/engine.ts';
import { createRestDefinitions } from '../src/data/world/rest.ts';
import { createPhysicalWorld } from '../src/world/engine.ts';
import { createPhysicalDefinitions } from '../src/data/world/physical.ts';
import { createFarmDefinitions } from '../src/data/world/farm.ts';
import {
  createWorld,
  createAnnualWorld,
  createRosterWorld,
  createRegistrationWorld,
  createRosterPolicyWorld,
  createFarmWorld,
} from '../src/world/engine.ts';
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

const registered = createRegistrationWorld();
console.log('登録・資格データ: ' + registered.registration.registrations.length + '人（検査成功）');

const policies = createRosterPolicyWorld();
console.log('固定希望データ: ' + policies.rosterControl.preferences.length + '人（検査成功）');

const farm = createFarmWorld();
console.log(
  '一軍・二軍: ' +
    farm.registration.memberships.length +
    '選手 / ' +
    farm.definitions.schedule.length +
    '試合（検査成功）',
);

const farmAnnual = createFarmWorld(undefined, undefined, createFarmDefinitions('annual'));
console.log('一軍・二軍の年間日程: ' + farmAnnual.definitions.schedule.length + '試合（検査成功）');

for (const calendar of ['short', 'annual'] as const) {
  const physical = createPhysicalWorld(undefined, undefined, createPhysicalDefinitions(calendar));
  console.log(
    '身体データ: ' +
      Object.keys(physical.physical.players).length +
      '選手 / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createRestWorld(undefined, undefined, createRestDefinitions(calendar));
  console.log(
    '休養方針: ' +
      Object.keys(world.restControl.teamPolicies).length +
      'チーム / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createConditionWorld(undefined, undefined, createConditionDefinitions(calendar));
  console.log(
    '調子データ: ' +
      Object.keys(world.condition.players).length +
      '選手 / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createPerformanceWorld(
    undefined,
    undefined,
    createPerformanceDefinitions(calendar),
  );
  console.log(
    '試合前補正: ' +
      world.definitions.performanceConfig!.version +
      ' / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createFielderRestWorld(
    undefined,
    undefined,
    createFielderRestDefinitions(calendar),
  );
  console.log(
    '野手休養: ' +
      Object.keys(world.fielderRest.teamPolicies).length +
      'チーム / ' +
      calendar +
      '（検査成功）',
  );
}
