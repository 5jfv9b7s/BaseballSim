import { SeasonCalendar } from './SeasonCalendar.tsx';
import { ClubEditor } from './ClubEditor.tsx';
import { useEffect, useRef, useState } from 'react';
import type { WorldAction, WorldCommand, WorldView } from '../world/controller.ts';
import type { WorldWorkerResponse } from '../world-worker.ts';
import { WorldStats } from './WorldStats.tsx';
import './world.css';

export function WorldApp() {
  const [view, setView] = useState<WorldView | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [calendar, setCalendar] = useState<'short' | 'annual'>('short');
  const [targetDate, setTargetDate] = useState('');
  const autoThrough = useRef('');
  const [seed, setSeed] = useState('20260924');
  const [controlledSquadId, setControlledSquadId] = useState('');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedGame, setSelectedGame] = useState('');
  const worker = useRef<Worker | null>(null);
  const latest = useRef<WorldView | null>(null);
  const pending = useRef(false);
  const auto = useRef(false);
  const lastAction = useRef<WorldAction['kind'] | null>(null);

  function send(action: WorldAction) {
    if (!worker.current || !latest.current || pending.current) return;
    pending.current = true;
    lastAction.current = action.kind;
    setBusy(true);
    setError('');
    setMessage('');
    worker.current.postMessage({
      ...action,
      commandId: crypto.randomUUID(),
      localWorldId: 'v02-local',
      expectedStateRevision: latest.current.revision,
    } satisfies WorldCommand);
  }

  function continueDay() {
    const current = latest.current;
    if (!current) return;
    if (current.currentDate > autoThrough.current) {
      auto.current = false;
      setRunning(false);
      return;
    }
    if (current.phase === 'playing') send({ kind: 'advance', count: 25 });
    else if (current.phase === 'readyToComplete')
      send({ kind: 'completeDay', date: current.currentDate });
    else {
      auto.current = false;
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
      if (!data.ok) {
        auto.current = false;
        setRunning(false);
        setError(data.error);
        return;
      }
      if (lastAction.current === 'completeDay') {
        if (data.view.currentDate > autoThrough.current) {
          auto.current = false;
          setRunning(false);
        }
        setSelectedDate('');
        setSelectedGame('');
        setMessage(
          data.view.lastCompletedDate + 'の全結果を反映し、翌日の状態を自動保存しました。',
        );
      }
      if (lastAction.current === 'setClubPlan' || lastAction.current === 'setGameStarter')
        setMessage('編成を確定し、自動保存しました。');
      if (lastAction.current === 'save') setMessage('世界全体を手動保存しました。');
      if (lastAction.current === 'load') {
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
        setEditorEpoch((value) => value + 1);
        setSelectedDate('');
        setSelectedGame('');
        setTargetDate('');
        setMessage('新しい日程を準備しました。');
      }
      if (data.view.phase === 'aborted') {
        auto.current = false;
        setRunning(false);
        setError(
          '試合が異常停止しました。未完了の結果を順位へ加算せず、日付進行を停止しています。',
        );
      }
      if (auto.current) continueDay();
    };
    instance.onerror = () => {
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

  function startThrough(date: string) {
    const current = latest.current;
    if (
      !current ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
      new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
      date < current.currentDate ||
      date > current.definitions.endDate
    ) {
      setError('進行先は現在日から日程最終日までの日付を指定してください。');
      return;
    }
    autoThrough.current = date;
    auto.current = true;
    setRunning(true);
    continueDay();
  }

  const squadName = (squadId: string) =>
    view?.definitions.squads.find((squad) => squad.squadId === squadId)?.team.name ?? squadId;
  const disabled = !view || busy || running;
  const canRun = view?.phase === 'playing' || view?.phase === 'readyToComplete';
  const resultDate = selectedDate || view?.lastCompletedDate || view?.currentDate || '';
  const games = view?.games.filter((game) => game.date === resultDate) ?? [];
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

  return (
    <main className="game-page world-page">
      <header>
        <div className="eyebrow">BASEBALL SIMULATOR / v1.0へ向けた球団運営</div>
        <span className="badge">{view?.definitions.name ?? '架空4球団・日次進行'}</span>
        <h1>シーズンを、日々の積み重ねで。</h1>
        <p>全試合の結果を成績と順位へ反映し、翌日へ進めます。</p>
      </header>

      <section className="panel" aria-label="日次進行">
        <h2>
          現在日：<time data-testid="world-date">{view?.currentDate ?? '準備中'}</time>
        </h2>
        <p>
          {view?.phase === 'scheduleComplete'
            ? '試作日程をすべて完了しました。'
            : `本日の試合：${view?.dayPlan.cursor ?? 0} / ${view?.dayPlan.gameIds.length ?? 0} 完了`}
        </p>
        {view?.dayPlan.gameIds.map((gameId) => {
          const game = view.games.find((item) => item.gameId === gameId)!;
          return (
            <p key={gameId}>
              {squadName(game.awaySquadId)}{' '}
              {game.score ? `${game.score.away} − ${game.score.home}` : '対'}{' '}
              {squadName(game.homeSquadId)} ・{' '}
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
              startThrough(view!.currentDate);
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
            進行する最終日{' '}
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
            onClick={() => startThrough(targetDate || view!.currentDate)}
          >
            指定日まで進行
          </button>
          <button
            className="secondary"
            disabled={disabled || !canRun}
            onClick={() => {
              const seventh = new Date(Date.parse(view!.currentDate + 'T00:00:00Z') + 6 * 86400000)
                .toISOString()
                .slice(0, 10);
              startThrough(
                seventh < view!.definitions.endDate ? seventh : view!.definitions.endDate,
              );
            }}
          >
            1週間を進行
          </button>
          <button
            className="secondary"
            disabled={disabled || !canRun}
            onClick={() => startThrough(view!.definitions.endDate)}
          >
            シーズン終了まで進行
          </button>
        </div>
        <p className="hint">
          指定日を含めて1日ずつ進み、毎日自動保存します。保存失敗・試合の異常停止で期間進行も止まります。
        </p>
        {running && <p role="status">{autoThrough.current}の終了まで進行中</p>}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {view?.storageError && <p className="error">{view.storageError}</p>}
      </section>

      {view && (
        <SeasonCalendar
          key={view.worldId + view.definitions.seasonId + editorEpoch}
          view={view}
          onSelect={(date) => {
            setSelectedDate(date);
            setSelectedGame('');
          }}
        />
      )}

      {view?.seasonSummary && (
        <section className="panel" aria-label="シーズン終了要約">
          <h2>シーズン終了</h2>
          <p>
            {view.seasonSummary.completedOn}までの全{view.seasonSummary.games}
            試合を確定し、年度要約を保存しました。
          </p>
          <p>
            {view.seasonSummary.title.status === 'decided'
              ? '試作リーグ優勝：' + squadName(view.seasonSummary.title.squadId)
              : '同率首位の決着規則が未定のため、優勝は未確定です。'}
          </p>
          <p>下の順位表・累計個人成績が今季の確定記録です。翌年度への更新と表彰は未対応です。</p>
        </section>
      )}

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
              {view?.standings.map((row) => (
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

      <section className="panel" aria-label="日別の試合結果">
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
            {squadName(game.awaySquadId)}{' '}
            {game.result ? `${game.result.score.away} − ${game.result.score.home}` : '対'}{' '}
            {squadName(game.homeSquadId)} ・{' '}
            {game.result
              ? game.result.winner === 'draw'
                ? '引き分け'
                : `${squadName(game.result.winner === 'away' ? game.awaySquadId : game.homeSquadId)}の勝利`
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
                  {squadName(game.awaySquadId)} 対 {squadName(game.homeSquadId)}
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
                      <th>
                        {squadName(
                          side === 'away' ? pickedGame.awaySquadId : pickedGame.homeSquadId,
                        )}
                      </th>
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
              <WorldStats lines={result} definitions={view.definitions} />
            </details>
          </>
        )}
      </section>

      <section className="panel" aria-label="累計個人成績">
        <h2>累計個人成績</h2>
        <details>
          <summary>打撃・投手・守備の累計を開く</summary>
          {view && <WorldStats lines={view.stats} definitions={view.definitions} />}
        </details>
      </section>

      <section className="panel" aria-label="世界の保存">
        <h2>世界の保存</h2>
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

      <details className="panel">
        <summary>新規日程・担当球団と試作の範囲</summary>
        <label>
          新規プレイの日程
          <select
            value={calendar}
            disabled={disabled}
            onChange={(event) => setCalendar(event.target.value as 'short' | 'annual')}
          >
            <option value="short">短期確認（4日・6試合）</option>
            <option value="annual">年間リーグ（各球団72試合）</option>
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
          短期確認と年間リーグを選べます。年間は架空4球団・3月27日〜9月30日・全144試合の暫定構成です。日程構成は暫定仕様です。
        </p>
        <p>
          試合はv0.1のv10モデルを使用します。係数は未校正です。追加2球団の能力は既存球団の複製です。二軍・疲労回復・成長・怪我・契約・翌年度更新は未対応です。
        </p>
      </details>
    </main>
  );
}
