import assert from 'node:assert/strict';
import { TradeWorkerWorkspace } from '../../src/world/trade-worker-workspace.ts';
import { TradeGameSession } from '../../src/world/trade-game-session.ts';
import { memoryStorage } from './trade-game-fixture.ts';
import type { TradeSavedState } from '../../src/world/trade-save-validation.ts';
import { applicationFixture } from './trade-application-fixture.ts';
import { tradeCreationTemplate } from '../../src/world/trade-creation-input.ts';
import type { TradeCreationSourceRef } from '../../src/world/trade-creation-types.ts';

/** 架空の給与・残高は既存の試験値だけ。製品のひな型やdataへ投入しない。 */
export function creationFixture() {
  const f = applicationFixture();
  const ref: TradeCreationSourceRef = {
    localWorldId: 'normal-creation-source',
    slotKind: 'auto',
    snapshotId: 'source-snapshot',
    storageRevision: 1,
  };
  const data = {
    format: 'trade-initial-input-v1',
    source: {
      ...ref,
      worldId: f.source.worldId,
      seasonId: f.source.definitions.seasonId,
      currentDate: f.source.currentDate,
    },
    asOf: structuredClone(f.world.rosterAsOf),
    playerFacts: f.world.playerFacts.map((p) => ({ ...p, label: '試験用の参照名' })),
    finance: structuredClone(f.world.finance),
  };
  const creationId = '00000000-0000-4000-8000-000000000065';
  return {
    ...f,
    ref,
    data,
    creationId,
    text: () => JSON.stringify(data, null, 2),
    template: () => tradeCreationTemplate(f.source, ref),
  };
}

export function creationWorkspaceFixture() {
  const f = creationFixture();
  const created = new Map<string, { saved: TradeSavedState; fingerprint: string }>();
  let attempts = 0,
    writes = 0,
    failAfterCommit = false;
  const workspace = new TradeWorkerWorkspace({
    async list() {
      return [];
    },
    async open(id) {
      const current = created.get(id);
      assert.ok(current);
      return TradeGameSession.open(memoryStorage(current.saved).storage);
    },
    creation: {
      async listSources() {
        return [
          { ...f.ref, label: '試験用の元保存', gameDate: f.source.currentDate, supported: true },
        ];
      },
      async loadSource(ref) {
        assert.deepEqual(ref, f.ref);
        return structuredClone(f.source);
      },
      async create(saved, options) {
        attempts++;
        const prior = created.get(saved.localWorldId);
        if (prior) {
          assert.equal(prior.fingerprint, options.fingerprint);
          return 'replayed';
        }
        created.set(saved.localWorldId, {
          saved: structuredClone(saved),
          fingerprint: options.fingerprint,
        });
        writes++;
        if (failAfterCommit) {
          failAfterCommit = false;
          throw new Error('応答前に成否不明');
        }
        return 'created';
      },
    },
  });
  return {
    ...f,
    workspace,
    created,
    counts: () => ({ attempts, writes }),
    failAfterCommit: () => {
      failAfterCommit = true;
    },
  };
}
