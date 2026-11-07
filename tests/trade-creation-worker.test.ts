import assert from 'node:assert/strict';
import test from 'node:test';
import { creationWorkspaceFixture } from './helpers/trade-creation-fixture.ts';
import { request } from './helpers/trade-worker-fixture.ts';

async function inspect(f: ReturnType<typeof creationWorkspaceFixture>, text = f.text()) {
  return f.workspace.handle(
    request(null, {
      kind: 'inspectCandidateCreation',
      source: f.ref,
      creationId: f.creationId,
      inputText: text,
    }),
  );
}

test('一覧・ひな型・検査は保存せず、初回保存後も自動openせず同じ作成IDを再実行しない', async () => {
  const f = creationWorkspaceFixture(),
    before = structuredClone(f.source);
  const listed = await f.workspace.handle(request(null, { kind: 'listCandidateSources' }));
  assert.equal(listed.creationSources?.length, 1);
  const template = await f.workspace.handle(
    request(listed, { kind: 'getCandidateInitialTemplate', source: f.ref }),
  );
  assert.equal(JSON.parse(template.initialTemplate!.text).playerFacts[0].canBat, null);
  const checked = await inspect(f);
  assert.equal(checked.creation?.state, 'ready');
  assert.equal(checked.active, null);
  assert.equal(checked.view, null);
  assert.equal(JSON.stringify(checked).includes('fullState'), false);
  assert.deepEqual(f.counts(), { attempts: 0, writes: 0 });
  assert.deepEqual(f.source, before);
  const first = await f.workspace.handle(
    request(checked, { kind: 'createCandidate', creationId: f.creationId }),
  );
  assert.equal(first.creation?.state, 'created');
  assert.equal(first.active, null);
  const again = await f.workspace.handle(
    request(first, { kind: 'createCandidate', creationId: f.creationId }),
  );
  assert.equal(again.creation?.state, 'created');
  assert.deepEqual(f.counts(), { attempts: 1, writes: 1 });
});

test('未入力・不正ファイルを保存せず、有効な準備は明示破棄するまで切替を拒否する', async () => {
  const f = creationWorkspaceFixture();
  const missing = await inspect(f, f.template());
  assert.equal(missing.creationInspection?.status, 'blocked');
  assert.equal(missing.creation, null);
  assert.equal((await inspect(f, '{bad')).ok, false);
  const checked = await inspect(f);
  assert.equal(checked.creation?.state, 'ready');
  const blocked = await f.workspace.handle(
    request(checked, { kind: 'openCandidate', localWorldId: checked.creation!.localWorldId }),
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.creation?.state, 'ready');
  const cleared = await f.workspace.handle(
    request(blocked, { kind: 'clearCandidateCreation', creationId: f.creationId }),
  );
  assert.equal(cleared.creation, null);
  assert.deepEqual(f.counts(), { attempts: 0, writes: 0 });
});

test('保存後の成否不明は同じ作成IDだけ再試行でき、別入力を黙って追加しない', async () => {
  const f = creationWorkspaceFixture(),
    checked = await inspect(f);
  f.failAfterCommit();
  const failed = await f.workspace.handle(
    request(checked, { kind: 'createCandidate', creationId: f.creationId }),
  );
  assert.equal(failed.ok, false);
  assert.equal(failed.creation?.state, 'uncertain');
  assert.equal((await inspect(f)).ok, false);
  const wrong = await f.workspace.handle(
    request(failed, { kind: 'createCandidate', creationId: 'other-id' }),
  );
  assert.equal(wrong.ok, false);
  assert.deepEqual(f.counts(), { attempts: 1, writes: 1 });
  const retried = await f.workspace.handle(
    request(wrong, { kind: 'createCandidate', creationId: f.creationId }),
  );
  assert.equal(retried.creation?.state, 'created');
  assert.deepEqual(f.counts(), { attempts: 2, writes: 1 });
});

test('候補を開いたままの作成準備と切替前の要求を拒否する', async () => {
  const f = creationWorkspaceFixture(),
    checked = await inspect(f);
  const saved = await f.workspace.handle(
    request(checked, { kind: 'createCandidate', creationId: f.creationId }),
  );
  const cleared = await f.workspace.handle(
    request(saved, { kind: 'clearCandidateCreation', creationId: f.creationId }),
  );
  const opened = await f.workspace.handle(
    request(cleared, { kind: 'openCandidate', localWorldId: saved.creation!.localWorldId }),
  );
  assert.equal(opened.ok, true);
  const stale = await inspect(f);
  assert.equal(stale.ok, false);
  const active = await f.workspace.handle(
    request(opened, {
      kind: 'inspectCandidateCreation',
      source: f.ref,
      inputText: f.text(),
      creationId: f.creationId,
    }),
  );
  assert.equal(active.ok, false);
  assert.deepEqual(active.view, opened.view);
  assert.deepEqual(f.counts(), { attempts: 1, writes: 1 });
});
