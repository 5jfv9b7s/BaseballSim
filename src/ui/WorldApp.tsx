import { FormationEditor } from './FormationEditor.tsx';
import {
  createFormationDraft,
  formationChanged,
  type FormationDraft,
} from '../world/formation-draft.ts';
import { MainScreen, type MainPage } from './MainScreen.tsx';
import {
  createProgressTarget,
  nextProgressAction,
  progressLabel,
  reachedProgressTarget,
  type ProgressTarget,
} from '../world/period-progress.ts';
import { MemorialPanel } from './MemorialPanel.tsx';
import { BackupPanel } from './BackupPanel.tsx';
import { MAX_PACKAGE_BYTES } from '../world/backup-zip.ts';
import type { StoredPlay, WorldSlotKind } from '../world/storage.ts';
import { StorageInspectionPanel } from './StorageInspectionPanel.tsx';
import type { StorageInspection } from '../world/storage-inspection.ts';
import { BullpenPanel } from './BullpenPanel.tsx';
import { ReliefPolicyEditor } from './ReliefPolicyEditor.tsx';
import { FielderRestEditor } from './FielderRestEditor.tsx';
import { PerformanceRoster } from './PerformanceRoster.tsx';
import { ConditionRoster } from './ConditionRoster.tsx';
import { RestPolicyEditor } from './RestPolicyEditor.tsx';
import { PhysicalRoster } from './PhysicalRoster.tsx';
import { allWorldSquads } from '../world/squads.ts';
import { FarmRoster } from './FarmRoster.tsx';
import { SeasonCalendar } from './SeasonCalendar.tsx';
import { RegistrationEditor } from './RegistrationEditor.tsx';
import { ClubEditor } from './ClubEditor.tsx';
import { useEffect, useRef, useState } from 'react';
import type { WorldAction, WorldCommand, WorldView } from '../world/controller.ts';
import type { WorldWorkerResponse } from '../world-worker.ts';
import { SeasonLeaderboard } from './SeasonLeaderboard.tsx';
import { WorldStats } from './WorldStats.tsx';
import './world.css';

export function WorldApp({
  development = false,
  onOpenTools,
}: {
  development?: boolean;
  onOpenTools: () => void;
}) {
  const [formation, setFormation] = useState<FormationDraft | null>(null);
  const formationBase = useRef<FormationDraft | null>(null);
  const formationDestination = useRef<MainPage | 'tools' | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [page, setPage] = useState<MainPage>('home');
  const [plays, setPlays] = useState<StoredPlay[]>([]);
  const [importedId, setImportedId] = useState('');
  const [view, setView] = useState<WorldView | null>(null);
  const [inspection, setInspection] = useState<StorageInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [calendar, setCalendar] = useState<'short' | 'annual'>('short');
  const [targetDate, setTargetDate] = useState('');
  const progressTarget = useRef<ProgressTarget | null>(null);
  const [seed, setSeed] = useState('20260924');
  const [controlledSquadId, setControlledSquadId] = useState('');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedGame, setSelectedGame] = useState('');
  const resultsRef = useRef<HTMLElement>(null);
  const [scope, setScope] = useState<'firstRegular' | 'farmRegular'>('firstRegular');
  const worker = useRef<Worker | null>(null);
  const latest = useRef<WorldView | null>(null);
  const pending = useRef(false);
  const auto = useRef(false);
  const lastAction = useRef<
    | WorldAction['kind']
    | 'inspectStorage'
    | 'exportSnapshot'
    | 'importSnapshot'
    | 'openPlay'
    | 'query'
    | null
  >(null);

  function send(action: WorldAction) {
    if (!worker.current || !latest.current || pending.current) return;
    pending.current = true;
    lastAction.current = action.kind;
    setInspection(null);
    setBusy(true);
    setError('');
    setMessage('');
    worker.current.postMessage({
      ...action,
      commandId: crypto.randomUUID(),
      localWorldId: latest.current.localWorldId,
      expectedStateRevision: latest.current.revision,
    } satisfies WorldCommand);
  }

  function finishNavigation(destination: MainPage | 'tools') {
    setFormation(null);
    formationBase.current = null;
    setSelectedPlayer('');
    if (destination === 'tools') onOpenTools();
    else {
      if (destination === 'today') {
        setScope('firstRegular');
        setSelectedDate(latest.current?.currentDate ?? '');
        setSelectedGame('');
      }
      setPage(destination);
    }
  }

  function beginFormation() {
    if (!latest.current || pending.current || auto.current || !latest.current.canEditManagement)
      return;
    const draft = createFormationDraft(latest.current);
    formationBase.current = draft;
    setFormation(draft ? structuredClone(draft) : null);
  }

  function navigate(destination: MainPage | 'tools') {
    if (formationDestination.current) return;
    if (
      page === 'formation' &&
      destination !== 'formation' &&
      formation &&
      formationBase.current &&
      formationChanged(formationBase.current, formation)
    ) {
      if (pending.current || auto.current) return;
      formationDestination.current = destination;
      send({ kind: 'setFormation', ...formation });
      return;
    }
    if (destination === 'formation') {
      if (page !== 'formation') beginFormation();
      setPage(destination);
    } else finishNavigation(destination);
  }

  function inspectStorage() {
    if (!worker.current || pending.current || auto.current) return;
    pending.current = true;
    lastAction.current = 'inspectStorage';
    setBusy(true);
    setError('');
    setMessage('');
    setInspection(null);
    worker.current.postMessage({ kind: 'inspectStorage' });
  }

  function beginFileAction(kind: 'exportSnapshot' | 'importSnapshot' | 'openPlay' | 'query') {
    if (!worker.current || !latest.current || pending.current || auto.current) return null;
    pending.current = true;
    lastAction.current = kind;
    setBusy(true);
    setError('');
    setMessage('');
    setInspection(null);
    return {
      localWorldId: latest.current.localWorldId,
      expectedStateRevision: latest.current.revision,
    };
  }

  function exportFile(slot: WorldSlotKind) {
    const context = beginFileAction('exportSnapshot');
    if (context) worker.current!.postMessage({ kind: 'exportSnapshot', slot, ...context });
  }

  async function importFile(file: File) {
    const context = beginFileAction('importSnapshot');
    if (!context) return;
    try {
      if (file.size > MAX_PACKAGE_BYTES)
        throw new Error('保存ファイルが容量上限（66MiB）を超えています');
      const bytes = new Uint8Array(await file.arrayBuffer());
      worker.current!.postMessage(
        { kind: 'importSnapshot', bytes, requestId: crypto.randomUUID(), ...context },
        [bytes.buffer],
      );
    } catch (error) {
      pending.current = false;
      setBusy(false);
      setError(error instanceof Error ? error.message : '保存ファイルを読み取れませんでした');
    }
  }

  function openPlay(targetLocalWorldId: string, slot: WorldSlotKind) {
    const context = beginFileAction('openPlay');
    if (context)
      worker.current!.postMessage({ kind: 'openPlay', targetLocalWorldId, slot, ...context });
  }

  function refreshPlays() {
    if (beginFileAction('query')) worker.current!.postMessage({ kind: 'query' });
  }

  function continueDay() {
    const current = latest.current;
    const target = progressTarget.current;
    if (!current || !target || !auto.current || pending.current) return;
    const action = nextProgressAction(current, target);
    if (action) send(action);
    else {
      auto.current = false;
      progressTarget.current = null;
      setRunning(false);
    }
  }

  useEffect(() => {
    const instance = new Worker(new URL('../world-worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<WorldWorkerResponse>) => {
      pending.current = false;
      setBusy(false);
      latest.current = data.view;
      setView(data.view);
      setPlays(data.plays ?? []);
      if (!data.ok) {
        formationDestination.current = null;
        progressTarget.current = null;
        auto.current = false;
        setRunning(false);
        setError(data.error);
        return;
      }
      if (data.playListError) setError(data.playListError);
      if (data.backup) {
        try {
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(data.backup.bytes)], { type: 'application/zip' }),
          );
          const link = document.createElement('a');
          link.href = url;
          link.download = data.backup.name;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          setMessage('保存済みの時点をファイルへ書き出しました。');
        } catch {
          setError('保存ファイルをダウンロードできませんでした。');
        }
      }
      if (data.importedLocalWorldId) {
        setImportedId(data.importedLocalWorldId);
        setMessage(
          '別プレイとして取り込みました。現在の作業は保持しています。下の一覧から開けます。',
        );
      }
      if (data.inspection) {
        setInspection(data.inspection);
        setMessage('保存容量を確認しました。データは削除していません。');
      }
      if (lastAction.current === 'completeDay') {
        const target = progressTarget.current;
        const arrived = target && reachedProgressTarget(data.view.currentDate, target);
        if (arrived) {
          auto.current = false;
          progressTarget.current = null;
          setRunning(false);
        }
        setSelectedDate((selected) => (selected >= data.view.currentDate ? selected : ''));
        setSelectedGame('');
        setMessage(
          data.view.lastCompletedDate +
            'の全結果を反映し、翌日の状態を自動保存しました。' +
            (arrived && target.boundary === 'beforeGames'
              ? target.date + 'の試合前で停止しました。'
              : ''),
        );
      }
      if (
        lastAction.current === 'setClubPlan' ||
        lastAction.current === 'setGameStarter' ||
        lastAction.current === 'setGameLineup' ||
        lastAction.current === 'setRegistrations' ||
        lastAction.current === 'setRosterPolicy' ||
        lastAction.current === 'setRestPolicy' ||
        lastAction.current === 'setFielderRestPolicy' ||
        lastAction.current === 'setReliefPolicy' ||
        lastAction.current === 'setGameBench'
      )
        setMessage('編成を確定し、自動保存しました。');
      if (lastAction.current === 'setFormation') {
        const destination = formationDestination.current;
        formationDestination.current = null;
        setMessage('編成の変更をまとめて確定し、自動保存しました。');
        if (destination) finishNavigation(destination);
      }
      if (lastAction.current === 'save') setMessage('世界全体を手動保存しました。');
      if (lastAction.current === 'load' || lastAction.current === 'openPlay') {
        progressTarget.current = null;
        setSelectedPlayer('');
        setFormation(null);
        formationBase.current = null;
        setScope('firstRegular');
        setEditorEpoch((value) => value + 1);
        setControlledSquadId(data.view.management?.controlledSquadId ?? '');
        auto.current = false;
        setRunning(false);
        setSelectedDate('');
        setSelectedGame('');
        setSeed(String(data.view.seed));
        setTargetDate('');
        setMessage('保存した世界を読み込みました。進行は停止しています。');
      }
      if (lastAction.current === 'new') {
        progressTarget.current = null;
        auto.current = false;
        setRunning(false);
        setSelectedPlayer('');
        setFormation(null);
        formationBase.current = null;
        setScope('firstRegular');
        setEditorEpoch((value) => value + 1);
        setSelectedDate('');
        setSelectedGame('');
        setTargetDate('');
        setMessage('新しい日程を準備しました。');
      }
      if (data.view.phase === 'aborted') {
        progressTarget.current = null;
        auto.current = false;
        setRunning(false);
        setError(
          '試合が異常停止しました。未完了の結果を順位へ加算せず、日付進行を停止しています。',
        );
      }
      if (auto.current) continueDay();
    };
    instance.onerror = () => {
      formationDestination.current = null;
      progressTarget.current = null;
      pending.current = false;
      auto.current = false;
      setBusy(false);
      setRunning(false);
      setError(
        '日次Workerでエラーが発生しました。再読み込み後、保存した世界を読み込んでください。',
      );
    };
    instance.postMessage({ kind: 'query' });
    return () => {
      auto.current = false;
      instance.terminate();
      worker.current = null;
    };
  }, []);

  function startProgress(date: string, boundary: ProgressTarget['boundary']) {
    const current = latest.current;
    if (!current || pending.current || auto.current) return;
    try {
      progressTarget.current = createProgressTarget(
        current.currentDate,
        current.definitions.endDate,
        date,
        boundary,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : '進行先の日付を確認してください。');
      return;
    }
    auto.current = true;
    setRunning(true);
    continueDay();
  }

  const squadName = (squadId: string) =>
    (view
      ? allWorldSquads(view.definitions).find((squad) => squad.squadId === squadId)?.team.name
      : null) ?? squadId;
  const storageAction = [
    'save',
    'load',
    'openPlay',
    'exportSnapshot',
    'importSnapshot',
    'inspectStorage',
    'query',
  ].includes(lastAction.current ?? '');
  const processingMessages: Partial<Record<NonNullable<typeof lastAction.current>, string>> = {
    save: '世界を手動保存しています。完了までこの画面を開いておいてください。',
    load: '保存を読み込み、内容を確認しています。完了後は停止状態で開きます。',
    openPlay: '選んだプレイを読み込み、内容を確認しています。',
    exportSnapshot: '保存内容を確認し、ファイルを書き出しています。',
    importSnapshot: '保存ファイルを確認し、別プレイへ取り込んでいます。',
    inspectStorage: '保存容量と履歴を確認しています。',
    query: '保存済みプレイの一覧を読み込んでいます。',
    completeDay: '当日の結果を確定し、翌日の状態を自動保存しています。',
  };
  const notice = busy ? (processingMessages[lastAction.current!] ?? '') : message;
  const notification = (running || notice) && (
    <p role="status">
      {running && (
        <span>
          {progressTarget.current && progressLabel(progressTarget.current)}進行中
          <br />
        </span>
      )}
      {notice}
    </p>
  );

  const disabled = !view || busy || running;
  const canRun = view?.phase === 'playing' || view?.phase === 'readyToComplete';
  const pausedTarget = !running && canRun ? progressTarget.current : null;
  const resultDate = selectedDate || view?.lastCompletedDate || view?.currentDate || '';
  const displayScope = view?.farm ? scope : 'firstRegular';
  const displayStats = displayScope === 'farmRegular' ? view?.farm?.stats : view?.stats;
  const displayStandings = displayScope === 'farmRegular' ? view?.farm?.standings : view?.standings;
  const displaySummary = displayScope === 'farmRegular' ? view?.farm?.summary : view?.seasonSummary;
  const games =
    view?.games.filter((game) => game.date === resultDate && game.statScope === displayScope) ?? [];
  const completedGames = games.filter((game) => game.result);
  const pickedGame =
    completedGames.find((game) => game.gameId === selectedGame) ?? completedGames[0];
  const result = pickedGame?.result;
  const dates = view
    ? [
        ...new Set([
          ...view.completedDates,
          ...view.definitions.schedule.map((game) => game.date),
          view.currentDate,
          ...(selectedDate ? [selectedDate] : []),
        ]),
      ].sort()
    : [];

  const formationView = view && (formation ?? createFormationDraft(view));
  const panels = {
    formation:
      view && formationView ? (
        <>
          {!formation && view.canEditManagement && (
            <button disabled={disabled} onClick={beginFormation}>
              編成の編集を開始
            </button>
          )}
          <FormationEditor
            key={view.localWorldId + editorEpoch}
            view={view}
            draft={formationView}
            changed={
              !!formation &&
              !!formationBase.current &&
              formationChanged(formationBase.current, formation)
            }
            locked={!formation || disabled || !view.canEditManagement}
            onChange={setFormation}
            onReset={() => {
              setFormation(structuredClone(formationBase.current));
              setError('');
            }}
            onSelectPlayer={setSelectedPlayer}
          />
        </>
      ) : (
        <p>このプレイは編成編集に対応していません。</p>
      ),
    progress: (
      <>
        <section className="panel" aria-label="日次進行">
          <h2>
            現在日：<time data-testid="world-date">{view?.currentDate ?? '準備中'}</time>
          </h2>
          <p>
            {view?.phase === 'scheduleComplete'
              ? '試作日程をすべて完了しました。'
              : `本日の試合：${view?.dayPlan.cursor ?? 0} / ${view?.dayPlan.gameIds.length ?? 0} 完了`}
          </p>
          {view?.farm &&
            !view.games.some(
              (game) => game.date === view.currentDate && game.statScope === 'firstRegular',
            ) && <p>一軍は今日は試合がありません。二軍の予定も含めて日次確定します。</p>}
          {view?.dayPlan.gameIds.map((gameId) => {
            const game = view.games.find((item) => item.gameId === gameId)!;
            return (
              <p key={gameId}>
                {game.display?.teams.away ?? squadName(game.awaySquadId)}{' '}
                {game.score ? `${game.score.away} − ${game.score.home}` : '対'}{' '}
                {game.display?.teams.home ?? squadName(game.homeSquadId)} ・{' '}
                {game.status === 'scheduled'
                  ? '試合前'
                  : game.status === 'completed'
                    ? '終了'
                    : game.status === 'aborted'
                      ? '異常停止'
                      : `進行中（${game.totalPitches}球）`}
              </p>
            );
          })}
          {view?.phase === 'readyToComplete' && view.dayPlan.gameIds.length === 0 && (
            <p>今日は試合がありません。日次確定と自動保存を行います。</p>
          )}
          <div className="world-controls">
            <button
              disabled={disabled || !canRun}
              onClick={() => {
                startProgress(view!.currentDate, 'afterDay');
              }}
            >
              1日を自動進行
            </button>
            <button
              className="secondary"
              disabled={!running}
              onClick={() => {
                auto.current = false;
                setRunning(false);
                setMessage('一時停止しました。実行中の処理が終わり次第、停止します。');
              }}
            >
              日次進行を一時停止
            </button>
            {pausedTarget && (
              <button
                className="secondary"
                disabled={disabled}
                onClick={() => startProgress(pausedTarget.date, pausedTarget.boundary)}
              >
                期間進行を再開
              </button>
            )}
            <button
              className="secondary"
              disabled={disabled || view?.phase !== 'readyToComplete'}
              onClick={() => send({ kind: 'completeDay', date: view!.currentDate })}
            >
              日次確定を再試行
            </button>
          </div>
          <div className="world-controls">
            <label>
              到着する日（試合前）{' '}
              <input
                type="date"
                value={targetDate || view?.currentDate || ''}
                min={view?.currentDate}
                max={view?.definitions.endDate}
                disabled={disabled || !canRun}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </label>
            <button
              disabled={disabled || !canRun}
              onClick={() => startProgress(targetDate || view!.currentDate, 'beforeGames')}
            >
              指定日の試合前まで進行
            </button>
            <button
              className="secondary"
              disabled={disabled || !canRun}
              onClick={() => {
                const seventh = new Date(
                  Date.parse(view!.currentDate + 'T00:00:00Z') + 6 * 86400000,
                )
                  .toISOString()
                  .slice(0, 10);
                startProgress(
                  seventh < view!.definitions.endDate ? seventh : view!.definitions.endDate,
                  'afterDay',
                );
              }}
            >
              1週間を進行
            </button>
            <button
              className="secondary"
              disabled={disabled || !canRun}
              onClick={() => startProgress(view!.definitions.endDate, 'afterDay')}
            >
              シーズン終了まで進行
            </button>
          </div>
          {pausedTarget && <p>一時停止中：{progressLabel(pausedTarget)}進行する予定です。</p>}
          <p className="hint">
            指定日は、その日の試合を始める前に止まります。1日・1週間・シーズン終了の進行は対象日の終了まで進めます。
            毎日自動保存し、保存失敗・試合の異常停止で止まります。
          </p>
          {development && !storageAction && notification}
          {development && error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {development && view?.storageError && <p className="error">{view.storageError}</p>}
        </section>
      </>
    ),
    competition: (
      <>
        {view?.farm && (
          <section className="panel" aria-label="大会の表示">
            <label>
              表示する大会{' '}
              <select
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as typeof scope);
                  setSelectedGame('');
                }}
              >
                <option value="firstRegular">一軍公式戦</option>
                <option value="farmRegular">二軍公式戦</option>
              </select>
            </label>
            <p className="hint">
              カレンダー・順位・結果・累計成績を切り替えます。日次進行は両方の全試合を処理します。
            </p>
          </section>
        )}
      </>
    ),
    calendar: (
      <>
        {view && (
          <SeasonCalendar
            key={view.worldId + view.definitions.seasonId + editorEpoch}
            view={view}
            scope={displayScope}
            selectedDate={selectedDate}
            canAdvance={!disabled && canRun}
            onAdvanceTo={(date) => {
              setTargetDate(date);
              startProgress(date, 'beforeGames');
            }}
            onSelect={(date) => {
              setSelectedDate(date);
              setSelectedGame('');
            }}
          />
        )}
      </>
    ),
    summary: displaySummary && (
      <section className="panel" aria-label="シーズン終了要約">
        <h2>{displayScope === 'farmRegular' ? '二軍シーズン終了' : 'シーズン終了'}</h2>
        <p>
          {displaySummary.completedOn}までの全{displaySummary.games}
          試合を確定し、年度要約を保存しました。
        </p>
        <p>
          {displaySummary.title.status === 'decided'
            ? '試作リーグ優勝：' + squadName(displaySummary.title.squadId)
            : '同率首位の決着規則が未定のため、優勝は未確定です。'}
        </p>
        <p>
          {development ? '下の順位表・累計個人成績' : '成績メニューのチーム成績・個人成績'}
          が今季の確定記録です。翌年度への更新と表彰は未対応です。
        </p>
      </section>
    ),
    management: (
      <>
        {view?.management ? (
          <ClubEditor
            key={JSON.stringify([view.worldId, view.management.controlledSquadId, editorEpoch])}
            view={view}
            management={view.management}
            disabled={disabled}
            send={send}
          />
        ) : (
          view && (
            <section className="panel">
              <p>
                旧v0.2の世界です。従来の日次進行を利用できます。編成操作は新しい日程で利用してください。
              </p>
            </section>
          )
        )}

        {view?.registration && (
          <RegistrationEditor
            key={JSON.stringify([
              'registration',
              view.worldId,
              view.management?.controlledSquadId,
              editorEpoch,
            ])}
            view={view}
            disabled={disabled}
            send={send}
          />
        )}

        {view?.bullpen && <BullpenPanel view={view} />}

        {view?.relief && (
          <ReliefPolicyEditor
            key={JSON.stringify(['relief', view.worldId, editorEpoch])}
            view={view}
            disabled={disabled}
            send={send}
          />
        )}
        {view?.fielderRestPolicy && (
          <FielderRestEditor
            key={JSON.stringify(['fielder-rest', view.worldId, editorEpoch])}
            view={view}
            disabled={disabled}
            send={send}
          />
        )}
        {view?.restPolicy && (
          <RestPolicyEditor
            key={JSON.stringify(['rest', view.worldId, editorEpoch])}
            view={view}
            disabled={disabled}
            send={send}
          />
        )}
        {view?.performance && <PerformanceRoster view={view} />}
        {view?.condition && <ConditionRoster view={view} />}
        {view?.physical && <PhysicalRoster view={view} />}
        {view?.farm && <FarmRoster view={view} />}
      </>
    ),
    standings: (
      <>
        <section className="panel" aria-label="順位表">
          <h2>順位表</h2>
          <p className="hint">
            確定済み試合の累計。勝率は引分を除き、同率は同順位とする試作規則です。
          </p>
          <div className="world-table">
            <table>
              <thead>
                <tr>
                  <th>順位</th>
                  <th>球団</th>
                  <th>試合</th>
                  <th>勝</th>
                  <th>敗</th>
                  <th>分</th>
                  <th>勝率</th>
                  <th>得点</th>
                  <th>失点</th>
                </tr>
              </thead>
              <tbody>
                {displayStandings?.map((row) => (
                  <tr key={row.squadId}>
                    <td>{row.rank ?? '-'}</td>
                    <th>{squadName(row.squadId)}</th>
                    <td>{row.games}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.draws}</td>
                    <td>{row.winPercentage?.toFixed(3) ?? '-'}</td>
                    <td>{row.runsFor}</td>
                    <td>{row.runsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    ),
    memorial: (
      <>
        {view && view.memorial[displayScope] && (
          <MemorialPanel
            record={view.memorial[displayScope]}
            onSelectGame={(entry) => {
              setSelectedDate(entry.achievedOn);
              setSelectedGame(entry.gameId);
              if (!development) setPage('results');
              resultsRef.current?.focus();
              resultsRef.current?.scrollIntoView({ block: 'start' });
            }}
          />
        )}
      </>
    ),
    results: (
      <>
        <section className="panel" aria-label="日別の試合結果" ref={resultsRef} tabIndex={-1}>
          <h2>日別の試合結果</h2>
          <label>
            結果の日付{' '}
            <select
              value={resultDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setSelectedGame('');
              }}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <p>表示している結果：{resultDate}</p>
          {games.length === 0 && <p>この日の試合はありません。</p>}
          {games.map((game) => (
            <p key={game.gameId}>
              {game.display?.teams.away ?? squadName(game.awaySquadId)}{' '}
              {game.result ? `${game.result.score.away} − ${game.result.score.home}` : '対'}{' '}
              {game.display?.teams.home ?? squadName(game.homeSquadId)} ・{' '}
              {game.result
                ? game.result.winner === 'draw'
                  ? '引き分け'
                  : `${game.display!.teams[game.result.winner]}の勝利`
                : '未確定'}
            </p>
          ))}
          {completedGames.length > 0 && (
            <label>
              詳細を表示する試合{' '}
              <select
                value={pickedGame!.gameId}
                onChange={(event) => setSelectedGame(event.target.value)}
              >
                {completedGames.map((game) => (
                  <option key={game.gameId} value={game.gameId}>
                    {game.display!.teams.away} 対 {game.display!.teams.home}
                  </option>
                ))}
              </select>
            </label>
          )}
          {result && view && pickedGame && (
            <>
              <div className="world-table">
                <table aria-label="日次のイニング別スコア">
                  <thead>
                    <tr>
                      <th>球団</th>
                      {result.innings.away.map((_, index) => (
                        <th key={index}>{index + 1}</th>
                      ))}
                      <th>計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['away', 'home'] as const).map((side) => (
                      <tr key={side}>
                        <th>{pickedGame.display!.teams[side]}</th>
                        {result.innings[side].map((score, index) => (
                          <td key={index}>{score ?? '×'}</td>
                        ))}
                        <td>{result.score[side]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>この試合の個人成績</summary>
                <WorldStats lines={result} displayPlayers={pickedGame.display!.players} />
              </details>
            </>
          )}
        </section>
      </>
    ),
    stats: (
      <>
        <section className="panel" aria-label="累計個人成績">
          <h2>累計個人成績</h2>
          <details open={!development}>
            <summary>打撃・投手・守備の累計を開く</summary>
            {view && displayStats && (
              <>
                <SeasonLeaderboard
                  key={view.worldId}
                  stats={displaySummary?.stats ?? displayStats}
                  definitions={view.definitions}
                  scope={displayScope}
                  onSelectPlayer={development ? undefined : setSelectedPlayer}
                  currentDate={view.currentDate}
                  completedOn={displaySummary?.completedOn}
                  controlledSquadId={view.management?.controlledSquadId}
                />
                <details>
                  <summary>並べ替え前の全項目一覧</summary>
                  <WorldStats
                    lines={displaySummary?.stats ?? displayStats}
                    definitions={view.definitions}
                  />
                </details>
              </>
            )}
          </details>
        </section>
      </>
    ),
    storage: (
      <>
        <section className="panel" aria-label="世界の保存">
          <h2>世界の保存</h2>
          {development && storageAction && notification}
          {view && (
            <BackupPanel
              view={view}
              plays={plays}
              importedId={importedId}
              disabled={disabled}
              exportFile={exportFile}
              importFile={importFile}
              openPlay={openPlay}
              refresh={refreshPlays}
            />
          )}
          <StorageInspectionPanel
            report={inspection}
            disabled={disabled}
            inspect={inspectStorage}
          />
          <p>
            {view?.unsavedChanges
              ? '作業状態には未保存の変更があります。'
              : '現在の作業状態は保存済みです。'}
          </p>
          <div className="world-controls">
            <button disabled={disabled} onClick={() => send({ kind: 'save' })}>
              世界を手動保存
            </button>
            <button
              className="secondary"
              disabled={disabled || !view?.slots.manual}
              onClick={() => send({ kind: 'load', slot: 'manual' })}
            >
              手動保存を読み込む
            </button>
            <button
              className="secondary"
              disabled={disabled || !view?.slots.auto}
              onClick={() => send({ kind: 'load', slot: 'auto' })}
            >
              自動保存を読み込む
            </button>
            <button
              className="secondary"
              disabled={disabled || !view?.slots.previousAuto}
              onClick={() => send({ kind: 'load', slot: 'previousAuto' })}
            >
              直前の自動保存を読み込む
            </button>
          </div>
          <p className="hint">
            自動保存の日付：{view?.slots.auto?.gameDate ?? '保存なし'} / 手動保存の日付：
            {view?.slots.manual?.gameDate ?? '保存なし'}
          </p>
          <p className="hint">
            手動保存は一時停止後に利用できます。ブラウザのサイトデータを削除すると保存も消えます。
          </p>
        </section>
      </>
    ),
    setup: (
      <>
        <details className="panel">
          <summary>新規日程・担当球団と試作の範囲</summary>
          <label>
            新規プレイの日程
            <select
              value={calendar}
              disabled={disabled}
              onChange={(event) => setCalendar(event.target.value as 'short' | 'annual')}
            >
              <option value="short">短期確認（4日・一軍6試合＋二軍4試合）</option>
              <option value="annual">年間リーグ（一軍72試合・二軍36試合／球団）</option>
            </select>
          </label>
          <label>
            新規プレイの担当球団
            <select
              value={
                controlledSquadId ||
                view?.management?.controlledSquadId ||
                view?.definitions.squads[0]?.squadId ||
                ''
              }
              disabled={disabled}
              onChange={(event) => setControlledSquadId(event.target.value)}
            >
              {view?.definitions.squads.map((squad) => (
                <option key={squad.squadId} value={squad.squadId}>
                  {squad.team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            世界seed{' '}
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              inputMode="numeric"
              disabled={disabled}
            />
          </label>
          <button
            disabled={disabled}
            onClick={() => {
              if (
                !/^\d+$/.test(seed) ||
                !Number.isSafeInteger(Number(seed)) ||
                Number(seed) < 1 ||
                Number(seed) > 0xffffffff
              ) {
                setError('seedは1～4294967295の整数を入力してください。');
                return;
              }
              send({
                kind: 'new',
                calendar,
                seed: Number(seed),
                controlledSquadId:
                  controlledSquadId ||
                  view?.management?.controlledSquadId ||
                  view?.definitions.squads[0]?.squadId,
              });
            }}
          >
            新しい日程を準備
          </button>
          <p>
            短期確認と年間リーグを選べます。年間は架空4球団・3月27日〜9月30日。一軍144試合、二軍72試合（9月15日まで）の暫定構成です。日程構成は暫定仕様です。
          </p>
          <p>
            係数は未校正で、選手・球団は検証用の架空データです。新規プレイでは一軍登録・抹消と当日のベンチ指定を利用できます。二軍は同じエンジンで自動進行します。能力・状態評価による自動昇降格、試合中の代打/交代・疲労による能力補正・成長・怪我・契約・翌年度更新は未対応です。新規プレイでは体力・疲労の日次回復と投手の休養方針を使用します。
          </p>
        </details>
      </>
    ),
  };

  if (!development)
    return (
      <MainScreen
        view={view}
        selectedPlayer={selectedPlayer}
        onSelectPlayer={setSelectedPlayer}
        page={page}
        onNavigate={navigate}
        panels={panels}
        busy={busy}
        running={running}
        error={error || view?.storageError || ''}
        notice={notification}
        hasSavedPlays={plays.length > 0}
        onPause={() => {
          auto.current = false;
          setRunning(false);
          setMessage('一時停止しました。実行中の処理が終わり次第、停止します。');
        }}
        onToday={() => navigate('today')}
        onOpenTools={() => navigate('tools')}
      />
    );

  return (
    <main className="game-page world-page">
      <header>
        <div className="eyebrow">BASEBALL SIMULATOR / v1.0へ向けた球団運営</div>
        <span className="badge">{view?.definitions.name ?? '架空4球団・日次進行'}</span>
        <h1>シーズンを、日々の積み重ねで。</h1>
        <p>全試合の結果を成績と順位へ反映し、翌日へ進めます。</p>
      </header>

      {panels.progress}
      {panels.competition}
      {panels.calendar}
      {panels.summary}
      {panels.management}
      {panels.standings}
      {panels.memorial}
      {panels.results}
      {panels.stats}
      {panels.storage}
      {panels.setup}
    </main>
  );
}
