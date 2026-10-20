import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createSeibuCandidateDataset } from '../src/data/initial-2026/seibu/index.ts';
import templates from '../src/data/initial-2026/seibu/preview-templates.json' with { type: 'json' };
import { parseCandidateDataset } from '../src/initial-data/validation.ts';
import { previewCandidatePitch, candidateVelocityRange } from '../src/initial-data/preview.ts';
import { createInitial2026PitchProfiles } from '../src/data/pitch-types/initial-2026.ts';
import { createPitchProfileConfig } from '../src/data/pitch-types/profiles.ts';
import { createTwoLeagueWorld, advanceWorld } from '../src/world/engine.ts';
import { planCandidateImport } from '../scripts/import-initial-candidates.ts';
import { InitialDataController } from '../src/initial-data/controller.ts';
import type { CandidateDataset } from '../src/initial-data/types.ts';

const d = createSeibuCandidateDataset();
const batter = d.players.find((p) => p.profile.positionGroup === 'OF')!;
const pitcher = d.players.find((p) => p.pitchRepertoires.length)!;
const request = {
  pitcherId: pitcher.playerId,
  pitchId: pitcher.pitchRepertoires[0]!.pitchId,
  batterId: batter.playerId,
  seed: 42,
  count: { balls: 0, strikes: 0 },
};

test('初期候補：70人・全22能力と9位置・162持ち球・未決定の資格/代表位置/由来を保持する', () => {
  assert.equal(d.players.length, 70);
  assert.equal(
    d.players.reduce((n, p) => n + Object.keys(p.commonAbilities).length, 0),
    1540,
  );
  assert.equal(
    d.players.reduce((n, p) => n + p.positionSkills.length, 0),
    630,
  );
  assert.equal(
    d.players.reduce((n, p) => n + p.pitchRepertoires.length, 0),
    162,
  );
  assert.equal(d.players.filter((p) => p.profile.primaryPosition === null).length, 17);
  assert.ok(
    d.players.every(
      (p) => p.readyForGameImport === false && p.profile.foreignPlayerEligibility === null,
    ),
  );
  assert.ok(
    d.players.some((p) => Object.values(p.commonAbilities).some((a) => a.status === 'proposed')),
  );
  assert.ok(
    d.players.some((p) =>
      Object.values(p.commonAbilities).some(
        (a) => a.status === 'generated-proposal-not-calibrated',
      ),
    ),
  );
  const copy = createSeibuCandidateDataset();
  copy.players[0]!.commonAbilities['running.speed'].valueMilli = 0;
  assert.deepEqual(createSeibuCandidateDataset(), d);
});

test('初期候補境界：欠落・重複・範囲/単位・由来・左右規約・勝手な正式化を拒否する', () => {
  const mutations: ((data: CandidateDataset) => void)[] = [
    (c) => {
      Object.assign(c, { formatVersion: 'future' });
    },
    (c) => {
      Object.assign(c, { readyForGameImport: true });
    },
    (c) => {
      Object.assign(c.players[0]!, { readyForGameImport: true });
    },
    (c) => {
      c.players[1]!.playerId = c.players[0]!.playerId;
    },
    (c) => {
      delete (
        c.players[0]!.commonAbilities as Partial<
          CandidateDataset['players'][number]['commonAbilities']
        >
      )['running.speed'];
    },
    (c) => {
      c.players[0]!.commonAbilities['running.speed'].valueMilli = NaN;
    },
    (c) => {
      c.players[0]!.commonAbilities['running.speed'].ceilingMilli = 0;
    },
    (c) => {
      Object.assign(c.players[0]!.positionSkills[0]!, { ceilingMilli: 120000 });
    },
    (c) => {
      c.players[0]!.positionSkills[1]!.positionCode = c.players[0]!.positionSkills[0]!.positionCode;
    },
    (c) => {
      c.players[0]!.growthProfile.talentMilli = 120001;
    },
    (c) => {
      c.players[0]!.profile.birthDate = '2026-02-30';
    },
    (c) => {
      c.players[0]!.profile.birthplace.countryCode = 'XX';
    },
    (c) => {
      c.players[0]!.profile.birthplace.regionId = 'JP-99';
    },
    (c) => {
      Object.assign(c.players[0]!.profile, { foreignPlayerEligibility: 'exempt' });
    },
    (c) => {
      c.players[0]!.pitchRepertoires[0]!.selectionWeight++;
    },
    (c) => {
      c.players[0]!.pitchRepertoires[0]!.velocity.maxCeilingCentiKph = 120;
    },
    (c) => {
      Object.assign(c.players[0]!.pitchRepertoires[0]!, {
        inputCoordinateConvention: 'already-left-mirrored',
      });
    },
    (c) => {
      c.players[0]!.pitchRepertoires[0]!.delivery.spinAxis.zPpm = 1000001;
    },
    (c) => {
      Object.assign(c.players[0]!.pitchRepertoires[0]!, { pitchTypeCode: 'unknown' });
    },
    (c) => {
      c.players[0]!.blockers.push(c.players[0]!.blockers[0]!);
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(d);
    mutate(copy);
    assert.throws(() => parseCandidateDataset(copy));
  }
});

test('追加4球種：21持ち球を含む全162候補を実際のv11計算へ接続し、別球種へ丸めない', () => {
  const before = structuredClone(d);
  assert.equal(createInitial2026PitchProfiles().profiles.length, 13);
  let added = 0;
  for (const p of d.players)
    for (const q of p.pitchRepertoires) {
      const r = previewCandidatePitch(d, { ...request, pitcherId: p.playerId, pitchId: q.pitchId });
      assert.equal(r.step.event.pitch.pitchId, q.pitchId);
      assert.equal(r.step.event.pitch.pitchTypeCode, q.pitchTypeCode);
      assert.ok(Number.isFinite(r.step.event.pitch.measurement.horizontalBreakMm));
      assert.deepEqual(r.fixture.pitches[0]!.delivery, q.delivery);
      if (q.engineSupport === 'profile-required') added++;
    }
  assert.equal(added, 21);
  assert.deepEqual(d, before);
  assert.equal(
    d.players
      .flatMap((p) => p.pitchRepertoires)
      .filter((q) => !candidateVelocityRange(q).reachesBasicMax).length,
    122,
  );
});

test('単球再現：同じ候補/seed/カウントで全状態が一致し、左投げを一度だけ鏡映する', () => {
  assert.deepEqual(previewCandidatePitch(d, request), previewCandidatePitch(d, request));
  const left = d.players.find((p) => p.profile.throwingHand === 'L' && p.pitchRepertoires.length)!;
  const q = left.pitchRepertoires[0]!;
  const input = { ...request, pitcherId: left.playerId, pitchId: q.pitchId };
  const l = previewCandidatePitch(d, input).step.event.pitch;
  assert.equal(l.measurement.release!.lateralMm, -q.delivery.release.lateralMm);
  assert.equal(l.measurement.spinAxis!.zPpm, -q.delivery.spinAxis.zPpm);
  const right = structuredClone(d);
  right.players.find((p) => p.playerId === left.playerId)!.profile.throwingHand = 'R';
  const r = previewCandidatePitch(right, input).step.event.pitch;
  assert.ok(r.measurement.horizontalBreakMm !== null);
  assert.equal(l.measurement.horizontalBreakMm, -r.measurement.horizontalBreakMm);
  assert.equal(l.measurement.verticalBreakMm, r.measurement.verticalBreakMm);
  assert.equal(l.velocityCentiKph, r.velocityCentiKph);
});

test('単球指示：他人の持ち球・未習得・不正seed/countを拒否し、正式世界と旧9球種を維持する', () => {
  for (const bad of [
    { seed: 0 },
    { seed: 1.5 },
    { batterId: pitcher.playerId },
    { pitcherId: 'missing' },
    { pitchId: 'missing' },
    { count: { balls: 4, strikes: 0 } },
  ])
    assert.throws(() => previewCandidatePitch(d, { ...request, ...bad }));
  const unlearned = structuredClone(d);
  unlearned.players.find(
    (p) => p.playerId === pitcher.playerId,
  )!.pitchRepertoires[0]!.acquisitionProgressMilli = 99999;
  assert.equal(
    parseCandidateDataset(unlearned).players.find((p) => p.playerId === pitcher.playerId)!
      .pitchRepertoires[0]!.acquisitionProgressMilli,
    99999,
  );
  assert.throws(() => previewCandidatePitch(unlearned, request));
  const twoWay = structuredClone(d);
  const outfielder = twoWay.players.find((p) => p.playerId === batter.playerId)!;
  const addedPitch = structuredClone(pitcher.pitchRepertoires[0]!);
  addedPitch.playerId = outfielder.playerId;
  addedPitch.pitchId = 'candidate-two-way-pitch';
  addedPitch.selectionWeight = 100000;
  outfielder.pitchRepertoires.push(addedPitch);
  const otherBatter = twoWay.players.find(
    (p) => p.playerId !== outfielder.playerId && p.profile.positionGroup === 'IF',
  )!;
  const twoWayResult = previewCandidatePitch(parseCandidateDataset(twoWay), {
    ...request,
    pitcherId: outfielder.playerId,
    pitchId: addedPitch.pitchId,
    batterId: otherBatter.playerId,
  });
  assert.equal(twoWayResult.step.event.pitch.pitchId, addedPitch.pitchId);

  const world = advanceWorld(createTwoLeagueWorld(1), 25),
    before = structuredClone(world);
  previewCandidatePitch(d, request);
  assert.deepEqual(world, before);
  assert.equal(createPitchProfileConfig().profiles.length, 9);
  assert.equal(createTwoLeagueWorld().definitions.version, 'world-definitions-v18');
  const controller = new InitialDataController();
  const first = controller.handle({ kind: 'query' });
  assert.ok(first.ok && first.dataset);
  first.dataset.players[0]!.profile.givenName = '画面側の変更';
  const again = controller.handle({ kind: 'query' });
  assert.ok(again.ok && again.dataset);
  assert.notEqual(again.dataset.players[0]!.profile.givenName, '画面側の変更');
  assert.equal(controller.handle({ ...request, kind: 'preview', seed: 0 }).ok, false);
  assert.equal(controller.handle({ ...request, kind: 'preview' }).ok, true);
});

test('取込計画：元資料を変更せず選手別出力を生成し、ハッシュ不一致を拒否する', async () => {
  const source = await mkdtemp(join(tmpdir(), 'baseball-candidates-'));
  const sourceFiles = {
    'data/player-candidates-v0.11.json': {
      datasetVersion: d.datasetVersion,
      status: d.status,
      sourceDraft: d.sourceDraft,
      players: d.players,
      readyForGameImport: false,
    },
    'data/region-catalog.json': d.locations,
    'data/pitching-physics-rule-v0.5.json': templates,
    'data/manifest.json': {
      datasetVersion: d.datasetVersion,
      activePlayerCount: 70,
      readyForGameImport: false,
      updatedOn: d.asOfDate,
      fictionalClub: d.club,
    },
  };
  const hashes: Record<string, string> = {};
  try {
    for (const [name, value] of Object.entries(sourceFiles)) {
      const text = JSON.stringify(value);
      await mkdir(join(source, name, '..'), { recursive: true });
      await writeFile(join(source, name), text);
      hashes[name] = createHash('sha256').update(text).digest('hex');
    }
    await mkdir(join(source, 'research'), { recursive: true });
    await writeFile(
      join(source, 'research/regression-baseline-v0.10.json'),
      JSON.stringify({ fileHashes: hashes }),
    );
    await writeFile(
      join(source, 'growth-completion-regression-verification.json'),
      JSON.stringify({ passed: true, hashes }),
    );
    const files = await planCandidateImport(source);
    assert.equal(files.size, 74);
    assert.equal([...files.keys()].filter((f) => f.startsWith('players/')).length, 70);
    assert.deepEqual(JSON.parse(files.get('players/' + pitcher.playerId + '.json')!), pitcher);
    assert.equal(files.has('research/model-map.json'), false);
    const meta = JSON.parse(files.get('metadata.json')!);
    assert.equal(Object.hasOwn(meta, 'referenceClub'), false);
    assert.equal(meta.readyForGameImport, false);
    await writeFile(join(source, 'data/region-catalog.json'), '{}');
    await assert.rejects(planCandidateImport(source), /ハッシュ/);
  } finally {
    assert.ok(
      resolve(source).startsWith(resolve(tmpdir()) + sep) &&
        basename(source).startsWith('baseball-candidates-'),
    );
    await rm(source, { recursive: true, force: true });
  }
});
