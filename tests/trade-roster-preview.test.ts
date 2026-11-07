import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTradeRosterDraft,
  swapDraftPositions,
  buildTradeRosterAction,
} from '../src/ui/trade-play/trade-roster-draft.ts';
import { opened, request, workerFixture } from './helpers/trade-worker-fixture.ts';
import { beginCommand } from './helpers/trade-game-fixture.ts';
import { policyCommand } from './helpers/trade-registration-fixture.ts';

function plan(first: Awaited<ReturnType<typeof opened>>) {
  const draft = createTradeRosterDraft(first.active!, first.view!),
    squad = draft.squads.find((s) => s.category === 'first')!;
  return buildTradeRosterAction(
    first.active!,
    first.view!,
    swapDraftPositions(draft, squad.squadId, 1, 2),
    'preview-plan',
  );
}

test('保存前検査を繰り返しても正本・RNG・receipt・保存を変えず、同じ案だけ後で確定できる', async () => {
  const f = workerFixture(),
    first = await opened(f),
    action = plan(first);
  const before = structuredClone(first.view),
    saved = await f.storage.read();
  for (let i = 0; i < 2; i++) {
    const checked = await f.workspace.handle(
      request(first, { kind: 'previewCandidateRoster', command: action.command }),
    );
    assert.equal(checked.ok, true);
    assert.equal(checked.rosterPreview?.status, 'ready');
    assert.equal(checked.rosterPreview?.commandId, action.command.commandId);
    assert.deepEqual(checked.view, before);
    assert.equal(checked.workspaceRevision, first.workspaceRevision);
  }
  assert.deepEqual(await f.storage.read(), saved);
  assert.equal(f.writes(), 0);
  const committed = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: action.command }),
  );
  assert.equal(committed.result?.status, 'applied');
  assert.equal(f.writes(), 1);
  const replayPreview = await f.workspace.handle(
    request(committed, { kind: 'previewCandidateRoster', command: action.command }),
  );
  assert.equal(replayPreview.ok, false);
  assert.equal(f.writes(), 1);
});

test('欠員の案は理由を表示するだけで登録を変えず、有効な再検査を妨げない', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const command = plan(first).command;
  command.squadReplacements[0]!.lineup.battingOrder[0]!.playerId = null;
  const blocked = await f.workspace.handle(
    request(first, { kind: 'previewCandidateRoster', command }),
  );
  assert.equal(blocked.ok, true);
  assert.equal(blocked.rosterPreview?.status, 'blocked');
  if (blocked.rosterPreview?.status === 'blocked')
    assert.ok(blocked.rosterPreview.issues.some((i) => i.code === 'lineupVacancy'));
  assert.deepEqual(blocked.view, first.view);
  assert.equal(f.writes(), 0);
  const corrected = await f.workspace.handle(
    request(blocked, { kind: 'previewCandidateRoster', command: plan(first).command }),
  );
  assert.equal(corrected.rosterPreview?.status, 'ready');
});

test('未保存の試合・再読込前のsessionからの検査を拒否し、進行と保存を変えない', async () => {
  const f = workerFixture(),
    first = await opened(f),
    action = plan(first);
  const playing = await f.workspace.handle(
    request(first, { kind: 'candidateCommand', command: beginCommand(f.initial) }),
  );
  const blocked = await f.workspace.handle(
    request(playing, { kind: 'previewCandidateRoster', command: action.command }),
  );
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.view, playing.view);
  const reload = await f.workspace.handle(
    request(blocked, {
      kind: 'reloadCandidate',
      expectedStateRevision: blocked.active!.stateRevision,
    }),
  );
  const stale = await f.workspace.handle({
    ...request(reload, { kind: 'previewCandidateRoster', command: action.command }),
    sessionId: first.active!.sessionId,
  });
  assert.equal(stale.ok, false);
  assert.equal(f.writes(), 0);
});

test('編成検査へ固定希望や正本差替を送れず、不正要求の後も正常な検査を受ける', async () => {
  const f = workerFixture(),
    first = await opened(f);
  const invalid = await f.workspace.handle(
    request(first, { kind: 'previewCandidateRoster', command: policyCommand(f.initial) as never }),
  );
  assert.equal(invalid.ok, false);
  const injected = await f.workspace.handle({
    ...request(first, { kind: 'previewCandidateRoster', command: plan(first).command }),
    state: f.initial.state,
  });
  assert.equal(injected.ok, false);
  const checked = await f.workspace.handle(
    request(first, { kind: 'previewCandidateRoster', command: plan(first).command }),
  );
  assert.equal(checked.rosterPreview?.status, 'ready');
  assert.ok(!JSON.stringify(checked.rosterPreview).includes('fingerprint'));
  assert.equal(f.writes(), 0);
});
