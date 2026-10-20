import { ensure, integer } from '../engine/validation.ts';
import { validateDelivery } from '../engine/pitch-profile-validation.ts';
import { PITCH_TYPES } from '../data/pitch-types/index.ts';
import { COMMON_ABILITIES, FIELD_POSITIONS } from './abilities.ts';
import type { CandidatePlayer, CandidateProjection, CandidateDataset } from './types.ts';

function fields(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    '初期候補の項目はオブジェクトが必要です',
  );
  const row = value as Record<string, unknown>;
  ensure(
    required.every((k) => Object.hasOwn(row, k)) &&
      Object.keys(row).every((k) => required.includes(k) || optional.includes(k)),
    '初期候補に欠落または未知の項目があります',
  );
}
function text(value: unknown): asserts value is string {
  ensure(
    typeof value === 'string' && value.trim().length > 0 && value.length <= 500,
    '初期候補の文字列が不正です',
  );
}
function identifier(value: unknown): void {
  text(value);
  ensure(
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value) && !Object.hasOwn(Object.prototype, value),
    '初期候補のIDが不正です',
  );
}
function date(value: unknown): void {
  text(value);
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value,
    '初期候補の日付が不正です',
  );
}
function ability(a: { valueMilli: number; ceilingMilli: number }): void {
  integer(a.valueMilli, 0, 120000, '現在能力');
  integer(a.ceilingMilli, a.valueMilli, 120000, '能力上限');
}
function list(value: unknown, max: number): asserts value is unknown[] {
  ensure(Array.isArray(value) && value.length <= max, '初期候補の一覧が不正です');
}
function member(value: unknown, values: readonly unknown[], label: string): void {
  ensure(values.includes(value), label + 'が不正です');
}
function player(value: unknown): asserts value is CandidatePlayer {
  fields(value, [
    'playerId',
    'profile',
    'primaryPositionCandidate',
    'commonAbilities',
    'positionSkills',
    'pitchingAptitudes',
    'growthProfile',
    'pitchRepertoires',
    'blockers',
    'readyForGameImport',
  ]);
  const p = value as unknown as CandidatePlayer;
  identifier(p.playerId);
  ensure(p.readyForGameImport === false, '候補を正式投入可へ自動昇格できません');
  fields(p.profile, [
    'playerId',
    'familyName',
    'givenName',
    'displayName',
    'birthDate',
    'birthplace',
    'throwingHand',
    'battingHand',
    'heightMm',
    'weightGrams',
    'positionGroup',
    'primaryPosition',
    'careerStage',
    'generationBatchId',
    'profileStatus',
    'foreignPlayerEligibility',
  ]);
  const f = p.profile;
  ensure(f.playerId === p.playerId, '選手IDとプロフィールIDが一致しません');
  text(f.familyName);
  text(f.givenName);
  if (f.displayName !== null) text(f.displayName);
  date(f.birthDate);
  ensure(
    f.birthDate >= '1900-01-01' && f.birthDate <= '2026-12-31',
    '出生年が候補資料の範囲外です',
  );
  fields(f.birthplace, ['countryCode', 'regionId']);
  text(f.birthplace.countryCode);
  if (f.birthplace.regionId !== null) identifier(f.birthplace.regionId);
  member(f.throwingHand, ['R', 'L'], '投げ手');
  member(f.battingHand, ['R', 'L', 'S'], '打ち手');
  integer(f.heightMm, 1, 3000, '身長mm');
  integer(f.weightGrams, 1, 500000, '体重g');
  member(f.positionGroup, ['P', 'C', 'IF', 'OF'], '調査用位置区分');
  member(f.primaryPosition, [...FIELD_POSITIONS, 'DH', null], '代表位置');
  ensure(
    f.careerStage === 'active' &&
      f.profileStatus === 'draft-primary-position-and-career-pending' &&
      f.foreignPlayerEligibility === null,
    'この候補形式では未決定の経歴・資格を保全してください',
  );
  identifier(f.generationBatchId);
  if (p.primaryPositionCandidate !== null) {
    fields(p.primaryPositionCandidate, ['positionCode', 'basis', 'games', 'level', 'status']);
    const c = p.primaryPositionCandidate;
    member(c.positionCode, [...FIELD_POSITIONS, 'DH'], '代表位置案');
    text(c.basis);
    integer(c.games, 0, 10000, '出場資料数');
    member(c.level, ['first', 'farm'], '資料階級');
    member(
      c.status,
      ['proposed-role-not-aptitude', 'proposed-lineup-role-not-defensive-position'],
      '代表位置案の状態',
    );
  }
  fields(p.commonAbilities, Object.keys(COMMON_ABILITIES));
  for (const a of Object.values(p.commonAbilities)) {
    fields(
      a,
      [
        'valueMilli',
        'ceilingMilli',
        'status',
        'candidateSource',
        'candidateKind',
        'ceilingCandidateSource',
      ],
      ['generationVersion', 'ruleVersion', 'confidence'],
    );
    ability(a);
    member(a.status, ['proposed', 'generated-proposal-not-calibrated'], '能力案の状態');
    member(
      a.candidateKind,
      [
        'existing-statistical-proposal',
        'fictional-completion',
        'generated-proposal',
        'reference-guided-completion',
      ],
      '能力案の由来',
    );
    text(a.candidateSource);
    text(a.ceilingCandidateSource);
    if (a.status === 'proposed') {
      text(a.ruleVersion);
      member(a.confidence, ['low', 'medium'], '資料量');
      ensure(a.generationVersion === undefined, '査定案と生成版を混同できません');
    } else {
      text(a.generationVersion);
      ensure(
        a.ruleVersion === undefined && a.confidence === undefined,
        '生成案へ査定情報を補完できません',
      );
    }
  }
  list(p.positionSkills, 9);
  ensure(
    p.positionSkills.length === 9 &&
      new Set(p.positionSkills.map((s) => s.positionCode)).size === 9,
    '守備9位置の重複・欠落があります',
  );
  for (const s of p.positionSkills) {
    fields(s, ['positionCode', 'aptitudeMilli', 'familiarity']);
    member(s.positionCode, FIELD_POSITIONS, '守備位置');
    integer(s.aptitudeMilli, 0, 120000, '固定適性');
    fields(s.familiarity, ['valueMilli', 'ceilingMilli']);
    ability(s.familiarity);
  }
  fields(p.pitchingAptitudes, ['starterMilli', 'relieverMilli']);
  Object.values(p.pitchingAptitudes).forEach((n) => integer(n, 0, 120000, '投手固定適性'));
  fields(p.growthProfile, ['talentMilli', 'ambitionMilli']);
  Object.values(p.growthProfile).forEach((n) => integer(n, 0, 120000, '成長要素'));
  list(p.pitchRepertoires, 32);
  const pitchIds = new Set<string>();
  for (const q of p.pitchRepertoires) {
    fields(q, [
      'pitchId',
      'playerId',
      'pitchTypeCode',
      'control',
      'repeatability',
      'velocity',
      'delivery',
      'inputCoordinateConvention',
      'acquisitionProgressMilli',
      'acquiredOn',
      'selectionWeight',
      'engineSupport',
      'requiresRarePitchReview',
    ]);
    identifier(q.pitchId);
    ensure(
      q.playerId === p.playerId && !pitchIds.has(q.pitchId),
      '持ち球の所有者またはID重複が不正です',
    );
    pitchIds.add(q.pitchId);
    ensure(
      typeof q.pitchTypeCode === 'string' && Object.hasOwn(PITCH_TYPES, q.pitchTypeCode),
      '辞書にない球種コードです',
    );
    for (const a of [q.control, q.repeatability]) {
      fields(a, ['valueMilli', 'ceilingMilli']);
      ability(a);
    }
    fields(q.velocity, [
      'typicalCentiKph',
      'maxCentiKph',
      'spreadCentiKph',
      'maxCeilingCentiKph',
      'provenance',
    ]);
    integer(q.velocity.typicalCentiKph, 5000, 18000, '中心球速');
    integer(q.velocity.maxCentiKph, q.velocity.typicalCentiKph, 20000, '基本MAX');
    integer(q.velocity.maxCeilingCentiKph, q.velocity.maxCentiKph, 20000, '基本MAX上限');
    integer(q.velocity.spreadCentiKph, 0, 2000, '球速幅');
    text(q.velocity.provenance);
    fields(q.delivery, ['spinRateRpm', 'spinSpreadRpm', 'spinAxis', 'release']);
    fields(q.delivery.spinAxis, ['xPpm', 'yPpm', 'zPpm']);
    fields(q.delivery.release, ['heightMm', 'lateralMm', 'extensionMm']);
    validateDelivery(q.delivery);
    ensure(
      q.inputCoordinateConvention === 'right-handed-reference',
      '回転入力は右投手基準で保持してください',
    );
    integer(q.acquisitionProgressMilli, 0, 100000, '習得進度');
    ensure(q.acquiredOn === null, '不明な習得日を補完できません');
    integer(q.selectionWeight, 0, 100000, '個人配球基礎重み');
    member(q.engineSupport, ['profile-required', 'supported-profile'], '資料時点の接続状態');
    ensure(typeof q.requiresRarePitchReview === 'boolean', '僅少球種の確認状態が不正です');
  }
  ensure(
    !p.pitchRepertoires.length ||
      p.pitchRepertoires.reduce((n, q) => n + q.selectionWeight, 0) === 100000,
    '個人配球基礎重みの合計は100000です',
  );
  list(p.blockers, 64);
  p.blockers.forEach(text);
  ensure(new Set(p.blockers).size === p.blockers.length, '接続条件が重複しています');
}
function projection(value: unknown, extra: string[] = []): asserts value is CandidateProjection {
  fields(value, [
    'datasetVersion',
    'status',
    'sourceDraft',
    'players',
    'readyForGameImport',
    ...extra,
  ]);
  const d = value as unknown as CandidateProjection;
  identifier(d.datasetVersion);
  ensure(
    d.status === 'review-projection-not-runtime-input' &&
      d.sourceDraft === 'growthCompletionDraft' &&
      d.readyForGameImport === false,
    '初期候補の版・状態が不正です',
  );
  list(d.players, 200);
  ensure(d.players.length > 0, '初期候補の選手が必要です');
  d.players.forEach(player);
  const ids = d.players.map((p) => p.playerId),
    pitches = d.players.flatMap((p) => p.pitchRepertoires.map((q) => q.pitchId));
  ensure(
    new Set(ids).size === ids.length && new Set(pitches).size === pitches.length,
    '選手または持ち球のIDが重複しています',
  );
}
export function parseCandidateProjection(value: unknown): CandidateProjection {
  projection(value);
  return structuredClone(value);
}

export function parseCandidateDataset(value: unknown): CandidateDataset {
  projection(value, ['formatVersion', 'asOfDate', 'club', 'sourceHashes', 'locations']);
  const d = value as CandidateDataset;
  ensure(d.formatVersion === 'initial-candidate-package-v1', '未対応の初期候補形式です');
  date(d.asOfDate);
  fields(d.club, ['clubId', 'displayName', 'regionLabel', 'nameStatus']);
  identifier(d.club.clubId);
  text(d.club.regionLabel);
  ensure(
    d.club.displayName === null && d.club.nameStatus === 'undecided',
    '未決定の球団名を候補取込で確定できません',
  );
  fields(d.sourceHashes, ['projection', 'locations', 'physicsRule']);
  for (const h of Object.values(d.sourceHashes))
    ensure(typeof h === 'string' && /^[a-f0-9]{64}$/.test(h), '元資料のSHA256が不正です');
  fields(d.locations, ['countries', 'regions']);
  list(d.locations.countries, 300);
  list(d.locations.regions, 1000);
  const countries = new Set<string>(),
    regions = new Map<string, string>();
  for (const c of d.locations.countries) {
    fields(c, ['countryCode', 'name']);
    text(c.countryCode);
    ensure(
      /^[A-Z]{2}$/.test(c.countryCode) && !countries.has(c.countryCode),
      '国コードが不正または重複しています',
    );
    countries.add(c.countryCode);
    text(c.name);
  }
  for (const r of d.locations.regions) {
    fields(r, ['regionId', 'countryCode', 'name']);
    identifier(r.regionId);
    text(r.name);
    ensure(countries.has(r.countryCode) && !regions.has(r.regionId), '地域の参照・重複が不正です');
    regions.set(r.regionId, r.countryCode);
  }
  for (const p of d.players) {
    const b = p.profile.birthplace;
    ensure(
      countries.has(b.countryCode) &&
        (b.regionId === null ? b.countryCode !== 'JP' : regions.get(b.regionId) === b.countryCode),
      '出身地の参照が不正です',
    );
    ensure(p.profile.birthDate <= d.asOfDate, '査定基準日より後の生年月日です');
  }
  return structuredClone(d);
}
