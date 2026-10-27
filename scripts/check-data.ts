import { pitchLearningCandidates } from '../src/data/pitch-learning/index.ts';
import { createPitchLearningDefinitions } from '../src/data/world/pitch-learning.ts';
import { createPitchLearningWorld } from '../src/world/engine.ts';
import { createCampDevelopmentDefinitions } from '../src/data/world/camp-development.ts';
import { createCampDevelopmentWorld } from '../src/world/engine.ts';
import {
  createRookieDevelopmentDefinitions,
  rookieProfileOverrides,
} from '../src/data/world/rookie-development.ts';
import { createRookieDevelopmentWorld } from '../src/world/engine.ts';
import { createAgeDevelopmentWorld } from '../src/world/engine.ts';
import { createAgeDevelopmentDefinitions } from '../src/data/world/age-development.ts';
import { createDevelopmentWorld } from '../src/world/engine.ts';
import { createDevelopmentDefinitions } from '../src/data/world/development.ts';
import { createDailyTrainingWorld } from '../src/world/engine.ts';
import { createDailyTrainingDefinitions } from '../src/data/world/daily-training.ts';
import { growthBasis } from '../src/world/growth-basis.ts';
import { createTrainingPlanWorld } from '../src/world/engine.ts';
import { createTrainingPlanDefinitions } from '../src/data/world/training-plans.ts';
import { trainingTargetAbilities, trainingTargetOptions } from '../src/world/training.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { createPlayerDevelopmentWorld } from '../src/world/engine.ts';
import { createPlayerDevelopmentDefinitions } from '../src/data/world/player-development.ts';
import { playerBaseAbilities } from '../src/world/player-development.ts';
import { createInitial2026PitchProfiles } from '../src/data/pitch-types/initial-2026.ts';
import { createSeibuCandidateDataset } from '../src/data/initial-2026/seibu/index.ts';
import { previewCandidatePitch } from '../src/initial-data/preview.ts';
import { createTwoLeagueWorld } from '../src/world/engine.ts';
import { createTwoLeagueDefinitions } from '../src/data/world/two-leagues.ts';
import { createLeagueStructureWorld } from '../src/world/engine.ts';
import { createLeagueStructureDefinitions } from '../src/data/world/league-structure.ts';
import { createPlayerProfileWorld } from '../src/world/engine.ts';
import { createPlayerProfileDefinitions } from '../src/data/world/player-profiles.ts';
import { createPitchProfileWorld } from '../src/world/engine.ts';
import { createPitchProfileDefinitions } from '../src/data/world/pitch-profiles.ts';
import { createBullpenWorld } from '../src/world/engine.ts';
import { createBullpenDefinitions } from '../src/data/world/bullpen.ts';
import { createReliefWorld } from '../src/world/engine.ts';
import { createReliefDefinitions } from '../src/data/world/relief.ts';
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
import { createIndividualPitchDefinitions } from '../src/data/world/individual-pitches.ts';
import { createIndividualPitchFixture } from '../src/data/datasets/individual-pitches.ts';
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
console.log('旧モデルの計算対応: ストレート、スライダー、フォーク');
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

for (const calendar of ['short', 'annual'] as const) {
  const world = createReliefWorld(undefined, undefined, createReliefDefinitions(calendar));
  console.log(
    '条件付き救援: ' +
      Object.keys(world.reliefControl.teamPolicies).length +
      'チーム / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createBullpenWorld(undefined, undefined, createBullpenDefinitions(calendar));
  console.log(
    '自動ブルペン: ' +
      world.definitions.bullpenInputs!.length +
      'チーム / ' +
      calendar +
      '（検査成功）',
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createPitchProfileWorld(
    undefined,
    undefined,
    createPitchProfileDefinitions(calendar),
  );
  console.log(
    '球種特性: ' +
      world.definitions.pitchProfiles!.profiles.length +
      '球種 / ' +
      calendar +
      '（検査成功）',
  );
}

createGame(1, createIndividualPitchFixture(), 'game-prototype-v11');
for (const calendar of ['short', 'annual'] as const) {
  const world = createPitchProfileWorld(1, undefined, createIndividualPitchDefinitions(calendar));
  const pitches = world.definitions.squads.flatMap((squad) => squad.pitches);
  console.log(
    `個人別球質: ${new Set(pitches.map((p) => p.playerId)).size}投手 / ${pitches.length}持ち球 / ${calendar}（検査成功）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createPlayerProfileWorld(1, undefined, createPlayerProfileDefinitions(calendar));
  console.log(
    `選手プロフィール: ${world.definitions.playerProfiles!.players.length}人 / ${calendar}（検査成功）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createLeagueStructureWorld(
    1,
    undefined,
    createLeagueStructureDefinitions(calendar),
  );
  console.log(
    `大会参加・本拠地: ${world.definitions.leagueStructure!.participations.length}チーム / ${world.definitions.leagueStructure!.stadiums.length}球場 / ${calendar}（検査成功）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createTwoLeagueWorld(undefined, undefined, createTwoLeagueDefinitions(calendar));
  console.log(
    '複数リーグ定義v18: ' +
      world.definitions.leagueStructure!.leagues.filter((l) => l.level === 'first').length +
      '一軍リーグ / ' +
      world.definitions.squads.length +
      '球団 / ' +
      calendar +
      '（検査成功）',
  );
}

const candidates = createSeibuCandidateDataset();
const previewCodes = new Set(createInitial2026PitchProfiles().profiles.map((p) => p.code));
let previewed = 0;
for (const player of candidates.players) {
  for (const pitch of player.pitchRepertoires) {
    // 候補の構造は全件検査済み。未習得・未対応の案は計算へ送らず保持する。
    if (pitch.acquisitionProgressMilli !== 100000 || !previewCodes.has(pitch.pitchTypeCode))
      continue;
    const batter = candidates.players.find(
      (p) => p.playerId !== player.playerId && p.profile.positionGroup !== 'P',
    );
    if (!batter) throw new Error('候補の単球検査には別の打者候補が必要です');
    previewCandidatePitch(candidates, {
      pitcherId: player.playerId,
      pitchId: pitch.pitchId,
      batterId: batter.playerId,
      seed: 1,
      count: { balls: 0, strikes: 0 },
    });
    previewed++;
  }
}
console.log(
  `初期候補: ${candidates.players.length}人・22能力・9位置・${candidates.players.flatMap((p) => p.pitchRepertoires).length}持ち球の入力、${previewed}件の単球検査成功（正式名簿へは未投入）`,
);

for (const calendar of ['short', 'annual'] as const) {
  const world = createPlayerDevelopmentWorld(
    undefined,
    undefined,
    createPlayerDevelopmentDefinitions(calendar),
  );
  const ids = world.definitions.squads.flatMap((squad) => squad.players.map((p) => p.playerId));
  for (const playerId of ids)
    if (Object.keys(playerBaseAbilities(world.definitions, playerId)!).length !== 22)
      throw new Error('共通能力が22項目ではありません');
  console.log(`22能力・適性（${calendar}）: ${ids.length}選手 / 9位置 / 定義v19（検査成功）`);
}

// index.tsに登録されていないJSONや、名前を取り違えた編集ファイルを見落とさない。
const developmentRoot = new URL('../src/data/development/', import.meta.url);
const developmentIds = new Set(
  createPlayerDevelopmentDefinitions().playerDevelopment!.players.map((p) => p.playerId),
);
const fileIds = new Set<string>();
for (const club of readdirSync(developmentRoot, { withFileTypes: true }).filter((entry) =>
  entry.isDirectory(),
)) {
  const folder = new URL(club.name + '/', developmentRoot);
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    const input = JSON.parse(readFileSync(new URL(file, folder), 'utf8'));
    if (
      file !== input.playerId + '.json' ||
      !developmentIds.has(input.playerId) ||
      fileIds.has(input.playerId)
    )
      throw new Error(
        '追加能力JSONのファイル名・登録・選手IDが不正です: ' + club.name + '/' + file,
      );
    fileIds.add(input.playerId);
  }
}
if (fileIds.size !== developmentIds.size) throw new Error('追加能力JSONに不足があります');
console.log(`追加能力JSONの登録照合: ${fileIds.size}人（検査成功）`);

for (const calendar of ['short', 'annual'] as const) {
  const world = createTrainingPlanWorld(
    undefined,
    undefined,
    createTrainingPlanDefinitions(calendar),
  );
  if (world.management.version !== 'club-management-v2')
    throw new Error('通常練習の状態がありません');
  for (const playerId of Object.keys(world.management.training.plans))
    for (const option of trainingTargetOptions(world.definitions, playerId))
      trainingTargetAbilities(world.definitions, playerId, option.target);
  console.log(
    `通常練習（${calendar}）: ${Object.keys(world.management.training.plans).length}選手 / 個別・群・9位置・本人の持ち球（検査成功、効果未接続）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createDailyTrainingWorld(
    undefined,
    undefined,
    createDailyTrainingDefinitions(calendar),
  );
  let abilities = 0;
  for (const id of Object.keys(world.growth.state.players)) {
    const basis = growthBasis(world.definitions, id);
    for (const row of basis) {
      if (world.growth.state.players[id]!.values[row.key] !== row.valueMilli)
        throw new Error('成長初期値の不一致');
    }
    abilities += basis.length;
  }
  console.log(
    `通常練習v1: ${calendar} / 全${Object.keys(world.growth.state.players).length}人 / ${abilities}能力 / 独立乱数・初期値・設定（検査成功）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createDevelopmentWorld(20260924, undefined, createDevelopmentDefinitions(calendar));
  const players = Object.keys(world.growth.state.players);
  if (
    players.length !== 120 ||
    Object.keys(world.growth.state.experienceRng).length !== players.length
  )
    throw new Error('実戦経験の全選手・独立乱数が不足しています');
  for (const id of players)
    if (world.growth.state.experienceRng[id]!.drawCount !== 0)
      throw new Error('未出場の経験乱数が消費されています');
  console.log(
    `実戦経験v1: ${calendar} / 全${players.length}人 / 通常練習と独立・設定・初期値（検査成功）`,
  );
}

for (const calendar of ['short', 'annual'] as const) {
  const w = createAgeDevelopmentWorld(
    20260924,
    undefined,
    createAgeDevelopmentDefinitions(calendar),
  );
  console.log(
    '年齢変化データ: ' +
      calendar +
      ' / ' +
      w.definitions.ageCurves!.players.length +
      '人（検査成功）',
  );
}

// 一人一JSONの登録漏れ・孤立ファイルも検査する。
{
  const catalog = createAgeDevelopmentDefinitions().ageCurves!;
  const files = readdirSync('src/data/age-curves', { recursive: true }).filter((name) =>
    String(name).endsWith('.json'),
  );
  const ids = files
    .map((name) => JSON.parse(readFileSync('src/data/age-curves/' + name, 'utf8')).playerId)
    .sort();
  if (JSON.stringify(ids) !== JSON.stringify(catalog.players.map((p) => p.playerId).sort()))
    throw Error('年齢曲線JSONの登録と実ファイルが一致しません');
  console.log('年齢曲線JSONの登録照合: ' + ids.length + '人（検査成功）');
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createRookieDevelopmentWorld(
    20260924,
    undefined,
    createRookieDevelopmentDefinitions(calendar),
  );
  console.log(
    `ルーキー覚醒：${calendar} / プロ1年目${Object.keys(world.growth.state.awakeningState.players).length}人（検査成功）`,
  );
}
{
  const folder = 'src/data/profiles/rookies-2026';
  const ids = readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) =>
      JSON.parse(readFileSync(folder + '/' + name, 'utf8')).map(
        (p: { playerId: string }) => p.playerId,
      ),
    )
    .sort();
  const registered = rookieProfileOverrides()
    .map((p) => p.playerId)
    .sort();
  if (JSON.stringify(ids) !== JSON.stringify(registered))
    throw Error('新人プロフィールJSONの登録と実ファイルが一致しません');
  console.log(`新人プロフィールJSON登録：${ids.length}人（検査成功）`);
}

for (const calendar of ['short', 'annual'] as const) {
  const w = createCampDevelopmentWorld(
    20260924,
    undefined,
    createCampDevelopmentDefinitions(calendar),
  );
  for (const period of w.definitions.campInputs!.periods) {
    if (period.players.length !== 120 || Object.keys(w.camp.plans[period.campId]!).length !== 120)
      throw Error('キャンプの全選手設定が不足しています');
    console.log(
      `キャンプ：${calendar} / ${period.label} / ${period.from}〜${period.through} / 全120人（検査成功）`,
    );
  }
}

for (const calendar of ['short', 'annual'] as const) {
  const world = createPitchLearningWorld(
    20260924,
    undefined,
    createPitchLearningDefinitions(calendar),
  );
  console.log(
    `新球種習得：${calendar} / ${Object.keys(world.growth.state.acquisition).length}候補（検査成功）`,
  );
}

{
  const root = new URL('../src/data/pitch-learning/', import.meta.url);
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((p) => p.endsWith('.json'));
  const ids = files
    .flatMap((file) =>
      JSON.parse(readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8')).map(
        (p: { pitchId: string }) => p.pitchId,
      ),
    )
    .sort();
  if (JSON.stringify(ids) !== JSON.stringify(pitchLearningCandidates.map((p) => p.pitchId).sort()))
    throw Error('球種習得JSONと登録が一致しません');
}
