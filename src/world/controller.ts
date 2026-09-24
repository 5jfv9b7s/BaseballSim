import { applyManagement, canEditManagement } from './management.ts';
import { ensure, id, integer } from '../engine/validation.ts';
import { canonicalJson } from '../storage/codec.ts';
import { advanceWorld, completeDay, createManagedWorld, worldPhase } from './engine.ts';
import { standings } from './stats.ts';
import {
  emptyWorldSlots,
  type WorldSlots,
  type WorldSlotKind,
  type WorldStorageAdapter,
} from './storage.ts';
import type { GameResult } from '../game/types.ts';
import type { WorldRecord, WorldPhase, ManagementAction, ClubManagement } from './types.ts';

export type WorldAction =
  | ManagementAction
  | { kind: 'new'; seed: number; controlledSquadId?: string }
  | { kind: 'advance'; count: number }
  | { kind: 'completeDay'; date: string }
  | { kind: 'save' }
  | { kind: 'load'; slot: WorldSlotKind };

export type WorldCommand = WorldAction & {
  commandId: string;
  localWorldId: 'v02-local';
  expectedStateRevision: number;
};

export interface WorldView {
  revision: number;
  worldId: string;
  modelVersion: WorldRecord['version'];
  management: ClubManagement | null;
  canEditManagement: boolean;
  seed: number;
  definitions: WorldRecord['definitions'];
  currentDate: string;
  lastCompletedDate: string | null;
  completedDates: string[];
  dayPlan: WorldRecord['dayPlan'];
  phase: WorldPhase;
  games: {
    gameId: string;
    date: string;
    awaySquadId: string;
    homeSquadId: string;
    status: 'scheduled' | 'playing' | 'completed' | 'aborted';
    score: { away: number; home: number } | null;
    totalPitches: number;
    result: GameResult | null;
    startingPitchers: { away: string; home: string } | null;
  }[];
  stats: WorldRecord['stats'];
  standings: ReturnType<typeof standings>;
  slots: WorldSlots;
  storageError: string | null;
  unsavedChanges: boolean;
}

/** Workerが直列実行する正本。日次保存成功前には日付を公開しない。 */
export class WorldController {
  private world: WorldRecord = createManagedWorld();
  private revision = 0;
  private slots = emptyWorldSlots();
  private storageError: string | null = null;
  private unsavedChanges = true;
  private processed = new Map<string, { fingerprint: string; view: WorldView }>();
  private storage: WorldStorageAdapter;

  constructor(storage: WorldStorageAdapter) {
    this.storage = storage;
  }

  async initialize(): Promise<WorldView> {
    try {
      this.slots = await this.storage.listSlots();
    } catch {
      this.storageError = '保存先を開けません。日次完了には自動保存の成功が必要です。';
    }
    return this.query();
  }

  query(): WorldView {
    const world = this.world;
    return structuredClone({
      revision: this.revision,
      worldId: world.worldId,
      modelVersion: world.version,
      management: world.version === 'world-prototype-v2' ? world.management : null,
      canEditManagement: canEditManagement(world),
      seed: world.seed,
      definitions: world.definitions,
      currentDate: world.currentDate,
      lastCompletedDate: world.lastCompletedDate,
      completedDates: world.completedDates,
      dayPlan: world.dayPlan,
      phase: worldPhase(world),
      games: world.definitions.schedule.map((scheduled) => {
        const game = world.games[scheduled.gameId];
        return {
          ...scheduled,
          status: !game
            ? 'scheduled'
            : game.result
              ? 'completed'
              : game.state.phase === 'aborted'
                ? 'aborted'
                : 'playing',
          score: game?.state.score ?? null,
          totalPitches: game?.state.totalPitches ?? 0,
          result: game?.result ?? null,
          startingPitchers: game
            ? {
                away: game.fixture.teams.away.pitcherIds[0]!,
                home: game.fixture.teams.home.pitcherIds[0]!,
              }
            : null,
        };
      }),
      stats: world.stats,
      standings: standings(world.stats),
      slots: this.slots,
      storageError: this.storageError,
      unsavedChanges: this.unsavedChanges,
    });
  }

  async dispatch(command: WorldCommand): Promise<WorldView> {
    id(command.commandId);
    ensure(command.localWorldId === 'v02-local', '対象のローカル世界が異なります');
    integer(command.expectedStateRevision, 0, Number.MAX_SAFE_INTEGER - 1, '状態版');
    ensure(
      ['new', 'advance', 'completeDay', 'save', 'load', 'setClubPlan', 'setGameStarter'].includes(
        command.kind,
      ),
      '未対応の世界指示です',
    );
    if (command.kind === 'new') integer(command.seed, 1, 0xffffffff, '世界seed');
    if (command.kind === 'advance') integer(command.count, 1, 25, '進行イベント数');
    if (command.kind === 'completeDay')
      ensure(typeof command.date === 'string', '完了日が不正です');
    if (command.kind === 'load')
      ensure(['auto', 'previousAuto', 'manual'].includes(command.slot), '保存枠が不正です');
    const fingerprint = canonicalJson(command);
    const prior = this.processed.get(command.commandId);
    if (prior) {
      ensure(prior.fingerprint === fingerprint, '同じ指示IDの内容が異なります');
      return structuredClone(prior.view);
    }
    ensure(command.expectedStateRevision === this.revision, '古い世界状態への指示です');
    ensure(this.processed.size < 10000, '指示上限です。手動保存して再読み込みしてください');

    if (command.kind === 'new') {
      this.world = createManagedWorld(command.seed, undefined, command.controlledSquadId);
      this.unsavedChanges = true;
      this.storageError = null;
    }
    if (command.kind === 'setClubPlan' || command.kind === 'setGameStarter') {
      const {
        commandId,
        expectedStateRevision: _revision,
        localWorldId: _worldId,
        ...action
      } = command;
      const next = applyManagement(this.world, commandId, action);
      if (next !== this.world) {
        try {
          const slots = await this.storage.save(
            next,
            this.revision + 1,
            'action',
            this.slots.storageRevision,
          );
          this.world = next;
          this.slots = slots;
          this.unsavedChanges = false;
          this.storageError = null;
        } catch (error) {
          this.storageError = '編成の自動保存に失敗しました。変更はまだ適用していません。';
          throw error;
        }
      }
    }
    if (command.kind === 'advance') {
      this.world = advanceWorld(this.world, command.count);
      this.unsavedChanges = true;
    }
    if (command.kind === 'completeDay') {
      const next = completeDay(this.world, command.date);
      try {
        const slots = await this.storage.save(
          next,
          this.revision + 1,
          'auto',
          this.slots.storageRevision,
        );
        this.world = next;
        this.slots = slots;
        this.unsavedChanges = false;
        this.storageError = null;
      } catch (error) {
        this.storageError =
          '自動保存に失敗しました。当日の結果を保持しています。「日次確定を再試行」で保存を再試行できます。';
        throw error;
      }
    }
    if (command.kind === 'save') {
      try {
        this.slots = await this.storage.save(
          this.world,
          this.revision + 1,
          'manual',
          this.slots.storageRevision,
        );
        this.unsavedChanges = false;
        this.storageError = null;
      } catch (error) {
        this.storageError = '手動保存に失敗しました。作業状態と以前の保存は保持しています。';
        throw error;
      }
    }
    if (command.kind === 'load') {
      const loaded = await this.storage.load(command.slot);
      this.world = loaded.world;
      this.slots = loaded.slots;
      this.unsavedChanges = false;
      this.storageError = null;
    }
    this.revision++;
    const view = this.query();
    this.processed.set(command.commandId, { fingerprint, view });
    return structuredClone(view);
  }
}
