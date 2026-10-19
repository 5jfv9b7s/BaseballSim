import { leagueStandings } from '../world/league-standings.ts';
import { LeagueStandingsPanel } from './LeagueStandingsPanel.tsx';
import { SeasonSummaryPanel } from './SeasonSummaryPanel.tsx';
import { gameStadium } from '../world/league-structure.ts';
import type { NewPlayOptions } from '../world/league-structure-types.ts';
import { NewPlayClubPreview } from './NewPlayClubPreview.tsx';
import { ProgressEstimate } from './ProgressEstimate.tsx';
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
import { BackupPanel, SavedPlayPicker } from './BackupPanel.tsx';
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
  const [newPlayOptions, setNewPlayOptions] = useState<NewPlayOptions | null>(null);
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
      setNewPlayOptions(data.newPlayOptions);
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
          '別プレイとして取り込みました。現在の作業は保持しています。「保存したプレイを再開」から開けます。',
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
            (arrived
              ? target.date +
                (target.boundary === 'beforeGames'
                  ? 'の試合前で停止しました。'
                  : 'の終了まで進めて停止しました。')
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
        setImportedId('');
        setPage('home');
        setMessage('新しい日程を準備しました。別プレイとして初回保存が完了しました。');
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

  const setup = newPlayOptions?.[calendar];
  const setupClub =
    setup?.clubs.find((c) => c.squadId === controlledSquadId) ??
    setup?.clubs.find((c) => c.squadId === view?.management?.controlledSquadId) ??
    setup?.clubs[0];
  const squadName = (squadId: string) =>
    (view
      ? allWorldSquads(view.definitions).find((squad) => squad.squadId === squadId)?.team.name
      : null) ?? squadId;
  const storageAction = [
    'new',
    'save',
    'load',
    'openPlay',
    'exportSnapshot',
    'importSnapshot',
    'inspectStorage',
    'query',
  ].includes(lastAction.current ?? '');
  const processingMessages: Partial<Record<NonNullable<typeof lastAction.current>, string>> = {
    new: '新しいプレイを作成し、初回保存しています。完了までこの画面を開いておいてください。',
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

  const resumeNotice =
    view?.revision === 0 && view.unsavedChanges && view.slots.storageRevision > 0
      ? '以前の保存があります。「世界の保存」から読み込むか、新規プレイを作成してください。'
      : '';
  const disabled = !view || busy || running;
  const canRun = !resumeNotice && (view?.phase === 'playing' || view?.phase === 'readyToComplete');
  const pausedTarget = !running && canRun ? progressTarget.current : null;
  const resultDate = selectedDate || view?.lastCompletedDate || view?.currentDate || '';
  const displayScope = view?.farm ? scope : 'firstRegular';
  const controlledClubId = view?.definitions.squads.find(
    (s) => s.squadId === view.management?.controlledSquadId,
  )?.team.clubId;
  const displayOwnSquadId =
    displayScope === 'farmRegular'
      ? view?.definitions.farm?.squads.find((s) => s.team.clubId === controlledClubId)?.squadId
      : view?.management?.controlledSquadId;

  const displayStats = displayScope === 'farmRegular' ? view?.farm?.stats : view?.stats;
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
  const formationPending =
    !!formation && !!formationBase.current && formationChanged(formationBase.current, formation);
  const seventh = view
    ? new Date(Date.parse(view.currentDate + 'T00:00:00Z') + 6 * 86400000)
        .toISOString()
        .slice(0, 10)
    : '';
  const weekEnd = view && seventh > view.definitions.endDate ? view.definitions.endDate : seventh;

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
            changed={formationPending}
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
        <section className="panel" aria-label="日次進行" id="world-progress">
          <h2>
            現在日：<time data-testid="world-date">{view?.currentDate ?? '準備中'}</time>
          </h2>
          <ol className="day-steps" aria-label="今日の進行段階">
            <li
              aria-current={
                view?.phase === 'playing' &&
                view.dayPlan.cursor === 0 &&
                !view.games.some(
                  (game) => game.date === view.currentDate && game.status !== 'scheduled',
                )
                  ? 'step'
                  : undefined
              }
            >
              1. 試合前
            </li>
            <li
              aria-current={
                view?.phase === 'playing' &&
                (view.dayPlan.cursor > 0 ||
                  view.games.some(
                    (game) => game.date === view.currentDate && game.status !== 'scheduled',
                  ))
                  ? 'step'
                  : undefined
              }
            >
              2. 自動試合
            </li>
            <li
              aria-current={
                view?.phase === 'readyToComplete' || view?.phase === 'scheduleComplete'
                  ? 'step'
                  : undefined
              }
            >
              3. 結果・日次確定
            </li>
          </ol>
          <section
            className="workflow-group workflow-primary"
            aria-labelledby="advance-day-heading"
          >
            <h3 id="advance-day-heading">今日を進める</h3>
            <p className="action-hint" id="advance-day-hint">
              {running
                ? '自動進行中です。一時停止すると、実行中の処理が終わり次第止まります。'
                : busy
                  ? '処理が終わるまでお待ちください。'
                  : !view
                    ? '試合情報を読み込み中です。'
                    : resumeNotice
                      ? resumeNotice
                      : view.phase === 'aborted'
                        ? '試合が異常停止しています。エラーを確認し、保存した時点からの再開をご検討ください。'
                        : !canRun
                          ? '今季の日程は終了しています。成績メニューで記録を確認できます。'
                          : '今日の一軍・二軍の全試合を終え、日次確定と自動保存まで行います。'}
            </p>
            <div className="world-controls">
              <button
                aria-describedby="advance-day-hint"
                disabled={disabled || !canRun}
                onClick={() => {
                  startProgress(view!.currentDate, 'afterDay');
                }}
              >
                1日を自動進行
              </button>
              <button
                className={running ? 'stop-action' : 'secondary'}
                aria-describedby="advance-day-hint"
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
            </div>
            {!running && <p className="hint">一時停止は、自動進行を始めると使えます。</p>}
          </section>
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
          <section className="workflow-group" aria-labelledby="advance-period-heading">
            <h3 id="advance-period-heading">まとめて進める</h3>
            <p className="action-hint" id="advance-period-hint">
              日付を選ぶだけでは進行しません。「指定日の終了まで進行」で開始します。
              選んだ当日の全試合・日次確定・自動保存まで行います。
            </p>
            <details className="workflow-disclosure">
              <summary>日付を入力して進める</summary>
              <div className="world-controls">
                <label>
                  進める最終日（当日を含む）{' '}
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
                  className="secondary"
                  aria-describedby="advance-period-hint advance-day-hint"
                  disabled={disabled || !canRun}
                  onClick={() => startProgress(targetDate || view!.currentDate, 'afterDay')}
                >
                  指定日の終了まで進行
                </button>
              </div>
              {view && <ProgressEstimate view={view} date={targetDate || view.currentDate} />}
            </details>
            <div className="period-shortcuts">
              <div>
                <button
                  className="secondary"
                  disabled={disabled || !canRun}
                  onClick={() => {
                    startProgress(weekEnd, 'afterDay');
                  }}
                >
                  1週間を進行
                </button>
                {view && <ProgressEstimate view={view} date={weekEnd} />}
              </div>
              <div>
                <button
                  className="secondary"
                  disabled={disabled || !canRun}
                  onClick={() => startProgress(view!.definitions.endDate, 'afterDay')}
                >
                  シーズン終了まで進行
                </button>
                {view && <ProgressEstimate view={view} date={view.definitions.endDate} />}
              </div>
            </div>
          </section>
          <details className="workflow-disclosure" open={view?.phase === 'readyToComplete'}>
            <summary>日次確定が止まったとき</summary>
            <p className="hint" id="retry-day-hint">
              全試合が終わり、日次確定を待っているときに使えます。保存に失敗した場合は、エラーの原因を解消してから再試行してください。
            </p>
            <div className="world-controls">
              <button
                className="secondary"
                disabled={disabled || view?.phase !== 'readyToComplete'}
                aria-describedby="retry-day-hint"
                onClick={() => send({ kind: 'completeDay', date: view!.currentDate })}
              >
                日次確定を再試行
              </button>
            </div>
          </details>
          {pausedTarget && <p>一時停止中：{progressLabel(pausedTarget)}進行する予定です。</p>}
          <p className="hint">
            どの進行方法でも指定日を含みます。対象日の全試合と日次確定が終わると、翌日の試合前で止まります。
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
            onOpenGame={(date, gameId) => {
              setSelectedDate(date);
              setSelectedGame(gameId);
              if (!development) navigate('results');
              else
                requestAnimationFrame(() => {
                  resultsRef.current?.focus();
                  resultsRef.current?.scrollIntoView({ block: 'start' });
                });
            }}
            onToday={() => {
              if (!development) navigate('today');
              else document.getElementById('world-progress')?.scrollIntoView({ block: 'start' });
            }}
            onAdvanceTo={(date) => {
              setTargetDate(date);
              startProgress(date, 'afterDay');
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
      <SeasonSummaryPanel
        summary={displaySummary}
        squadName={squadName}
        ownSquadId={displayOwnSquadId}
      />
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
    standings: view && (
      <LeagueStandingsPanel
        key={JSON.stringify([view.worldId, displayScope])}
        groups={leagueStandings(
          view.definitions,
          displayScope === 'farmRegular' ? view.farm!.stats : view.stats,
          displayScope,
        )}
        squadName={squadName}
        ownSquadId={displayOwnSquadId}
        confirmedThrough={view.lastCompletedDate}
      />
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
              <p>
                開催球場：
                {gameStadium(view.definitions, pickedGame.gameId)?.displayName ?? '記録なし'}
              </p>
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
          <section
            className="workflow-group workflow-primary"
            aria-labelledby="save-current-heading"
          >
            <h3 id="save-current-heading">現在の作業を保存</h3>
            <p className="save-state" data-unsaved={view?.unsavedChanges}>
              {!view
                ? '保存状態を読み込み中です。'
                : view.unsavedChanges
                  ? '作業状態には未保存の変更があります。'
                  : '現在の作業状態は保存済みです。'}
            </p>
            <div className="world-controls">
              <button
                disabled={disabled || Boolean(resumeNotice)}
                aria-describedby="manual-save-hint"
                onClick={() => send({ kind: 'save' })}
              >
                世界を手動保存
              </button>
            </div>
            <p className="action-hint" id="manual-save-hint">
              {resumeNotice
                ? resumeNotice
                : running || busy
                  ? '処理が終わるか、進行を一時停止してから保存できます。'
                  : '現在の状態で手動保存枠を更新します。自動保存の枠はそのまま残ります。'}
            </p>
          </section>

          {view && (
            <SavedPlayPicker
              view={view}
              plays={plays}
              importedId={importedId}
              disabled={disabled}
              openPlay={openPlay}
              refresh={refreshPlays}
            />
          )}

          <section className="workflow-group" aria-labelledby="restore-heading">
            <h3 id="restore-heading">このプレイの保存時点に戻る</h3>
            <p className="hint" id="restore-hint">
              読み込むと、現在の作業を選んだ保存時点に戻します。残したい変更は先に手動保存してください。
              {(running || busy) && ' 処理が終わるか、進行を一時停止してから読み込めます。'}
            </p>
            <div className="save-slot-grid">
              {(
                [
                  ['manual', '手動保存を読み込む', '自分で保存した時点'],
                  ['auto', '自動保存を読み込む', '最新の自動保存時点'],
                  ['previousAuto', '直前の自動保存を読み込む', 'ひとつ前の自動保存時点'],
                ] as const
              ).map(([slot, label, description]) => (
                <div className="save-slot" key={slot}>
                  <h4>{description}</h4>
                  <p id={`slot-${slot}-hint`}>
                    {view?.slots[slot] ? (
                      <>
                        ゲーム内日付：<time>{view.slots[slot].gameDate}</time>
                      </>
                    ) : (
                      '保存がないため、まだ読み込めません。'
                    )}
                  </p>
                  <button
                    className="secondary"
                    disabled={disabled || !view?.slots[slot]}
                    aria-describedby={`restore-hint slot-${slot}-hint`}
                    onClick={() => send({ kind: 'load', slot })}
                  >
                    {label}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {view && (
            <BackupPanel
              view={view}
              disabled={disabled}
              exportFile={exportFile}
              importFile={importFile}
            />
          )}
          <StorageInspectionPanel
            report={inspection}
            disabled={disabled}
            inspect={inspectStorage}
          />
          <p className="hint">
            ブラウザのサイトデータを削除すると保存も消えます。保管用にはファイルのバックアップをご利用ください。
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
              value={setupClub?.squadId ?? ''}
              disabled={disabled}
              onChange={(event) => setControlledSquadId(event.target.value)}
            >
              {setup?.clubs.map((squad) => (
                <option key={squad.squadId} value={squad.squadId}>
                  {squad.displayName}
                </option>
              ))}
            </select>
          </label>
          <NewPlayClubPreview calendar={setup} club={setupClub} />
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
            disabled={disabled || !setupClub || (!!view?.unsavedChanges && view.revision > 0)}
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
                controlledSquadId: setupClub?.squadId,
              });
            }}
          >
            新しい日程を準備
          </button>
          {view?.unsavedChanges && view.revision > 0 && (
            <div>
              <p>未保存の変更があります。新規作成の前に現在の作業を保存してください。</p>
              <button disabled={disabled} onClick={() => send({ kind: 'save' })}>
                現在の作業を手動保存
              </button>
            </div>
          )}
          <p>
            既存の保存を保持し、独立したプレイを作成します。初回保存に成功するとホームを開きます。
          </p>
          <p>
            短期確認と年間リーグを選べます。年間は架空4球団・3月27日〜9月30日。一軍144試合、二軍72試合（9月15日まで）の暫定構成です。日程構成は暫定仕様です。
          </p>
          <p>
            係数は未校正で、選手・球団は検証用の架空データです。新規プレイでは一軍登録・抹消と当日のベンチ指定を利用できます。二軍は同じエンジンで自動進行します。能力・状態評価による自動昇降格、試合中の代打/交代・恒久的な成長・怪我・契約・翌年度更新は未対応です。新規プレイでは体力・疲労の日次回復、試合開始時の状態による能力補正、投手の休養方針を使用します。
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
        error={error || view?.storageError || resumeNotice}
        notice={notification}
        hasSavedPlays={plays.length > 0}
        formationPending={formationPending}
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

      {resumeNotice && <p role="alert">{resumeNotice}</p>}
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
