import type { Block } from '../src/world/save-format.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeTradeSnapshot, decodeTradeSnapshot } from '../src/world/trade-snapshot-codec.ts';
import { validateTradeManifest, MAX_TRADE_BLOCK_BYTES } from '../src/world/trade-save-format.ts';
import { validateTradeSavedState } from '../src/world/trade-save-validation.ts';
import { validateTradeSaveTransition } from '../src/world/trade-save-transition.ts';
import { canonicalJson } from '../src/storage/codec.ts';
import { tradeSaveFixture, committedTradeSaveFixture } from './helpers/trade-save-fixture.ts';

test('全個人状態・初期資料・会計・承認とreceiptを欠落なく復元する', async () => {
  const f = await committedTradeSaveFixture(),
    before = structuredClone(f.candidate);
  const encoded = await encodeTradeSnapshot(f.candidate, 'parent-not-needed');
  const restored = await decodeTradeSnapshot(encoded.snapshot, encoded.blocks);
  assert.deepEqual(restored, before);
  assert.deepEqual(f.candidate, before);
  assert.equal(restored.tradeReceipts.length, 1);
  assert.equal(restored.state.tradeApprovals[0]!.appliedTransactionId, f.request.transactionId);
  restored.state.physical.players[f.request.moves[0]!.playerId]!.energyMilli = 0;
  assert.deepEqual(f.candidate, before);
});

test('0・null・負の残高を補完せず、そのまま保存する', async () => {
  const { initial } = tradeSaveFixture();
  initial.state.finance.budgets[0]!.openingBalance = null;
  initial.state.finance.budgets[1]!.openingBalance!.balanceYen = -100;
  initial.state.physical.players[initial.state.playerFacts[0]!.playerId]!.energyMilli = 0;
  const encoded = await encodeTradeSnapshot(initial, null);
  assert.deepEqual(await decodeTradeSnapshot(encoded.snapshot, encoded.blocks), initial);
});

test('親目録なしで復元でき、定義ブロックは同じ内容なら共有できる', async () => {
  const f = await committedTradeSaveFixture();
  const a = await encodeTradeSnapshot(f.initial, null),
    b = await encodeTradeSnapshot(f.candidate, 'absent-parent');
  assert.equal(
    a.blocks.find((r) => r.logicalKey === 'definitions')!.blockId,
    b.blocks.find((r) => r.logicalKey === 'definitions')!.blockId,
  );
  assert.deepEqual(await decodeTradeSnapshot(b.snapshot, b.blocks), f.candidate);
});

test('目録ハッシュの不一致と、ブロックの不足を拒否する', async () => {
  const { initial } = tradeSaveFixture(),
    encoded = await encodeTradeSnapshot(initial, null);
  const bad = structuredClone(encoded.snapshot);
  bad.manifestHash = '0'.repeat(64);
  await assert.rejects(decodeTradeSnapshot(bad, encoded.blocks), /目録ハッシュ/);
  const blocks: (Block | undefined)[] = [...encoded.blocks];
  blocks[0] = undefined;
  await assert.rejects(decodeTradeSnapshot(encoded.snapshot, blocks), /ブロックがありません/);
});

test('圧縮ブロックの破損・参照違い・未知codecを拒否する', async () => {
  const { initial } = tradeSaveFixture(),
    encoded = await encodeTradeSnapshot(initial, null);
  for (const kind of ['payload', 'reference', 'codec']) {
    const blocks = structuredClone(encoded.blocks);
    if (kind === 'payload') blocks[0]!.payloadBytes[0] = blocks[0]!.payloadBytes[0]! ^ 255;
    if (kind === 'reference') blocks[0]!.logicalKey = 'finance';
    if (kind === 'codec') Reflect.set(blocks[0]!, 'codec', 'unknown');
    await assert.rejects(decodeTradeSnapshot(encoded.snapshot, blocks));
  }
});

test('展開前に未知形式・重複役割・宣言容量超過を拒否する', async () => {
  const { initial } = tradeSaveFixture(),
    { snapshot } = await encodeTradeSnapshot(initial, null);
  for (const kind of ['version', 'duplicate', 'capacity']) {
    const bad = structuredClone(snapshot);
    if (kind === 'version') Reflect.set(bad.versions, 'saveFormatVersion', 'future-format');
    if (kind === 'duplicate') bad.blockRefs[1] = structuredClone(bad.blockRefs[0]!);
    if (kind === 'capacity') bad.blockRefs[0]!.rawBytes = MAX_TRADE_BLOCK_BYTES + 1;
    assert.throws(() => validateTradeManifest(bad));
  }
});

test('未知の世界項目やモデル版と、壊れた完全RNGを拒否する', () => {
  for (const kind of ['field', 'model', 'rng']) {
    const { initial } = tradeSaveFixture();
    if (kind === 'field') Reflect.set(initial.state, 'futureData', { required: true });
    if (kind === 'model') Reflect.set(initial.state.camp, 'version', 'unknown-model');
    if (kind === 'rng')
      initial.state.condition.players[
        initial.state.playerFacts[0]!.playerId
      ]!.conditionModelState.state.rng.fullState.word = 0;
    assert.throws(() => validateTradeSavedState(initial));
  }
});

test('確定記録の削除・指紋差替え・適用済み承認の参照違いを拒否する', async () => {
  const { candidate } = await committedTradeSaveFixture();
  for (const kind of ['missing', 'fingerprint', 'approval']) {
    const bad = structuredClone(candidate);
    if (kind === 'missing') bad.tradeReceipts = [];
    if (kind === 'fingerprint') bad.tradeReceipts[0]!.fingerprint = canonicalJson({ kind: 'save' });
    if (kind === 'approval') bad.state.tradeApprovals[0]!.appliedTransactionId = 'other';
    assert.throws(() => validateTradeSavedState(bad));
  }
});

test('確定指示の再計算と異なる個人状態・台帳の変更を保存前に拒否する', async () => {
  const f = await committedTradeSaveFixture();
  await validateTradeSaveTransition(f.initial, f.candidate);
  const bad = structuredClone(f.candidate);
  bad.state.physical.players[f.request.moves[0]!.playerId]!.energyMilli -= 1;
  await assert.rejects(validateTradeSaveTransition(f.initial, bad), /再計算と一致しません/);
});

test('保存準備のawait中に呼出元が変更しても同じ時点の候補を保存する', async () => {
  const { initial } = tradeSaveFixture(),
    before = structuredClone(initial);
  const preparation = encodeTradeSnapshot(initial, null);
  initial.state.physical.players[initial.state.playerFacts[0]!.playerId]!.energyMilli = 1;
  const encoded = await preparation;
  assert.deepEqual(await decodeTradeSnapshot(encoded.snapshot, encoded.blocks), before);
});
