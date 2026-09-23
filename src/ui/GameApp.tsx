import { CURRENT_GAME_MODEL, type GameModelVersion } from '../game/model-registry.ts';
import { useEffect, useRef, useState } from 'react';
import { App as PitchLab } from './App.tsx';
import type { GameCommand, GameView } from '../game/controller.ts';
import type { GameWorkerResponse } from '../game-worker.ts';
import type { AppearanceOutcome, GameEvent, TeamSide } from '../game/types.ts';
import { createGameFixture, playerName } from '../game/fixture.ts';
import { battingAverage, earnedRunAverage, inningsPitched } from '../game/results.ts';

const fixture = createGameFixture();
const labels: Record<AppearanceOutcome, string> = {
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  homeRun: '本塁打',
  walk: '四球',
  hitByPitch: '死球',
  strikeout: '三振',
  battedOut: '打球アウト',
};
const pitchLabels = {
  ball: 'ボール',
  calledStrike: '見逃しストライク',
  swingingStrike: '空振り',
  foul: 'ファウル',
  inPlay: '打球',
  hitByPitch: '死球',
};

function eventText(event: GameEvent): string {
  if (event.substitution)
    return `投手交代：${playerName(fixture, event.substitution.outPlayerId)} → ${playerName(fixture, event.substitution.inPlayerId)}`;
  if (event.kind === 'halfEnd') return '攻守交代・終了判定';
  if (event.kind === 'aborted') return '投球上限に達したため異常停止';
  return `${event.pitch ? playerName(fixture, event.pitch.batterId) : ''}：${event.outcome ? labels[event.outcome] : event.pitch ? pitchLabels[event.pitch.ruling] : ''}${event.runDecisions.length ? `（${event.runDecisions.length}得点）` : ''}`;
}

type Action =
  | { kind: 'new'; seed: number; modelVersion: GameModelVersion }
  | { kind: 'advance'; count: number }
  | { kind: 'save' }
  | { kind: 'load'; previous: boolean };

function MatchGame() {
  const worker = useRef<Worker | null>(null);
  const serial = useRef(0);
  const pending = useRef(false);
  const latest = useRef<GameView | null>(null);
  const auto = useRef(false);
  const [view, setView] = useState<GameView | null>(null);
  const [busy, setBusy] = useState(true);
  const [running, setRunning] = useState(false);
  const [seed, setSeed] = useState('20260923');
  const [modelVersion, setModelVersion] = useState<GameModelVersion>(CURRENT_GAME_MODEL);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lastAction = useRef<Action['kind'] | null>(null);

  function send(action: Action) {
    if (pending.current || !latest.current || !worker.current) return;
    const command: GameCommand = {
      ...action,
      commandId: `game-ui-${++serial.current}`,
      expectedStateRevision: latest.current.revision,
    };
    pending.current = true;
    lastAction.current = action.kind;
    setBusy(true);
    setError('');
    setMessage('');
    worker.current.postMessage(command);
  }

  useEffect(() => {
    const instance = new Worker(new URL('../game-worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<GameWorkerResponse>) => {
      pending.current = false;
      setBusy(false);
      if (!data.ok) {
        auto.current = false;
        setRunning(false);
        setError(data.error);
        return;
      }
      latest.current = data.view;
      setView(data.view);
      if (lastAction.current === 'save')
        setMessage('保存しました。再読み込み後も同じ結果を確認できます。');
      if (lastAction.current === 'load') setMessage('保存した試合を読み込みました。');
      if (data.view.state.phase === 'gameComplete' || data.view.state.phase === 'aborted') {
        auto.current = false;
        setRunning(false);
      }
      if (auto.current) {
        // 同じadvanceを小さな単位で繰り返す。表示・待ち時間は試合乱数を消費しない。
        send({ kind: 'advance', count: 25 });
      }
    };
    instance.onerror = () => {
      pending.current = false;
      auto.current = false;
      setBusy(false);
      setRunning(false);
      setError('試合Workerでエラーが発生しました。再読み込みしてください。');
    };
    instance.postMessage({ kind: 'query' });
    return () => {
      auto.current = false;
      instance.terminate();
      worker.current = null;
    };
  }, []);

  const state = view?.state;
  const complete = state?.phase === 'gameComplete';
  const aborted = state?.phase === 'aborted';
  const playable = !!state && !complete && !aborted;
  const result = view?.result;
  const winner = result?.winner;
  const title = complete
    ? winner === 'draw'
      ? '引き分け'
      : `${fixture.teams[winner!].name}の勝利`
    : aborted
      ? '異常停止'
      : 'プレーボール、その先へ。';

  function newGame() {
    if (
      !/^\d+$/.test(seed) ||
      !Number.isSafeInteger(Number(seed)) ||
      Number(seed) < 1 ||
      Number(seed) > 0xffffffff
    ) {
      setError('seedは1～4294967295の整数を入力してください。');
      return;
    }
    send({ kind: 'new', seed: Number(seed), modelVersion });
  }

  return (
    <main className="game-page">
      <header>
        <div className="eyebrow">BASEBALL SIMULATOR / GAME v0.1</div>
        <span className="badge">架空2球団・試作モデル</span>
        <h1>{title}</h1>
        <p>1球ずつ積み重ねる、1試合のシミュレーション。</p>
      </header>

      <section className="game-score panel" aria-label="試合状況">
        <div>
          <span className="eyebrow">AWAY</span>
          <h2>{fixture.teams.away.name}</h2>
          <strong>{state?.score.away ?? 0}</strong>
        </div>
        <div className="game-inning">
          <span>
            {complete
              ? '試合終了'
              : aborted
                ? '停止'
                : state
                  ? `${state.inning}回${state.half === 'top' ? '表' : '裏'}`
                  : '準備中'}
          </span>
          <small>
            {state ? `${state.outs}アウト / ${state.count.balls}B – ${state.count.strikes}S` : ''}
          </small>
        </div>
        <div>
          <span className="eyebrow">HOME</span>
          <h2>{fixture.teams.home.name}</h2>
          <strong>{state?.score.home ?? 0}</strong>
        </div>
      </section>

      <section className="panel game-actions">
        <label className="model-choice">
          新しい試合のモデル
          <select
            aria-label="試合モデル"
            value={modelVersion}
            disabled={busy || running}
            onChange={(e) => setModelVersion(e.target.value as GameModelVersion)}
          >
            <option value="game-prototype-v6">3ボール配球試作 v6</option>
            <option value="game-prototype-v5">打球品質試作 v5</option>
            <option value="game-prototype-v4">2ストライク対応試作 v4</option>
            <option value="game-prototype-v3">投球判断試作 v3</option>
            <option value="game-prototype-v2">改善試作 v2</option>
            <option value="game-prototype-v1">従来試作 v1</option>
          </select>
        </label>
        <div className="game-seed">
          <label>
            試合seed
            <input
              inputMode="numeric"
              value={seed}
              disabled={busy || running}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
          <button className="secondary" disabled={busy || running} onClick={newGame}>
            新しい試合を準備
          </button>
        </div>
        <div className="game-buttons">
          <button
            className="primary"
            disabled={busy || running || !playable}
            onClick={() => {
              auto.current = true;
              setRunning(true);
              send({ kind: 'advance', count: 25 });
            }}
          >
            1試合を自動進行
          </button>
          <button
            className="secondary"
            disabled={!running}
            onClick={() => {
              auto.current = false;
              setRunning(false);
            }}
          >
            一時停止
          </button>
          <button
            className="secondary"
            disabled={busy || running || !playable}
            onClick={() => send({ kind: 'advance', count: 1 })}
          >
            1イベント進める
          </button>
        </div>
        <p className="hint">
          現在の試合seed：{view?.seed ?? '準備中'}
          。適用中：{view?.state.simulationVersion ?? 'game-prototype-v1'}
          。新しい試合を準備すると未保存の結果は置き換わります。
        </p>
        <p className="game-progress" aria-live="polite">
          {running
            ? '自動進行中…'
            : complete
              ? `終了：${state?.totalPitches}球 / ${result?.completedAppearances}打席`
              : aborted
                ? '異常を検出しました。正常な試合結果としては保存できません。'
                : `${state?.totalPitches ?? 0}球を処理`}
        </p>
        {state && (
          <p className="base-status">
            一塁：
            {state.baseOccupants[0]
              ? playerName(fixture, state.baseOccupants[0].currentRunnerId)
              : 'なし'}
            　 二塁：
            {state.baseOccupants[1]
              ? playerName(fixture, state.baseOccupants[1].currentRunnerId)
              : 'なし'}
            　 三塁：
            {state.baseOccupants[2]
              ? playerName(fixture, state.baseOccupants[2].currentRunnerId)
              : 'なし'}
          </p>
        )}
      </section>

      <section className="panel game-lines" aria-label="イニング別スコア">
        <h2>イニング別スコア</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>球団</th>
                {Array.from({ length: Math.max(9, state?.inning ?? 9) }, (_, i) => (
                  <th key={i}>{i + 1}</th>
                ))}
                <th>計</th>
              </tr>
            </thead>
            <tbody>
              {(['away', 'home'] as const).map((side) => (
                <tr key={side}>
                  <th>{fixture.teams[side].name}</th>
                  {Array.from({ length: Math.max(9, state?.inning ?? 9) }, (_, i) => (
                    <td key={i}>
                      {state?.innings[side][i] ??
                        (complete && side === 'home' && i === state.inning - 1 ? 'X' : '–')}
                    </td>
                  ))}
                  <td>
                    <strong>{state?.score[side] ?? 0}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {result && (
        <section className="game-statistics" aria-label="試合成績">
          {(['away', 'home'] as const).map((side: TeamSide) => (
            <section className="panel" key={side}>
              <h2>{fixture.teams[side].name}</h2>
              <h3>打者成績</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>打席</th>
                      <th>打数</th>
                      <th>安打</th>
                      <th>本塁打</th>
                      <th>打点</th>
                      <th>得点</th>
                      <th>四球</th>
                      <th>死球</th>
                      <th>三振</th>
                      <th>打率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixture.teams[side].lineup.map((slot) => {
                      const p = result.batting.find((p) => p.playerId === slot.playerId)!;
                      return (
                        <tr key={p.playerId}>
                          <th>
                            {playerName(fixture, p.playerId)} <small>{slot.position}</small>
                          </th>
                          <td>{p.plateAppearances}</td>
                          <td>{p.atBats}</td>
                          <td>{p.hits}</td>
                          <td>{p.homeRuns}</td>
                          <td>{p.runsBattedIn}</td>
                          <td>{p.runs}</td>
                          <td>{p.walks}</td>
                          <td>{p.hitByPitch}</td>
                          <td>{p.strikeouts}</td>
                          <td>{battingAverage(p.hits, p.atBats)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <h3>投手成績</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>選手</th>
                      <th>投球回</th>
                      <th>球数</th>
                      <th>打者</th>
                      <th>被安打</th>
                      <th>奪三振</th>
                      <th>与四球</th>
                      <th>与死球</th>
                      <th>失点</th>
                      <th>自責点</th>
                      <th>防御率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fixture.teams[side].pitcherIds.map((id) => {
                      const p = result.pitching.find((p) => p.playerId === id)!;
                      return (
                        <tr key={id}>
                          <th>{playerName(fixture, id)}</th>
                          <td>{p.pitches ? inningsPitched(p.outsRecorded) : '–'}</td>
                          <td>{p.pitches}</td>
                          <td>{p.battersFaced}</td>
                          <td>{p.hitsAllowed}</td>
                          <td>{p.strikeouts}</td>
                          <td>{p.walks}</td>
                          <td>{p.hitBatters}</td>
                          <td>{p.runsAllowed}</td>
                          <td>{p.earnedRuns}</td>
                          <td>{earnedRunAverage(p.earnedRuns, p.outsRecorded)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
      )}

      <section className="panel game-save">
        <h2>試合を保存・再表示</h2>
        <p className="muted">
          このブラウザに終了した試合を保存します。手動保存1枠と前の保存に対応しています。
        </p>
        <div className="game-buttons">
          <button
            className="primary"
            disabled={!complete || busy || running}
            onClick={() => send({ kind: 'save' })}
          >
            試合結果を保存
          </button>
          <button
            className="secondary"
            disabled={!view?.slots.snapshotId || busy || running}
            onClick={() => send({ kind: 'load', previous: false })}
          >
            保存した試合を読み込む
          </button>
          <button
            className="secondary"
            disabled={!view?.slots.previousSnapshotId || busy || running}
            onClick={() => send({ kind: 'load', previous: true })}
          >
            前の保存を読み込む
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {view?.storageError && (
          <p className="error" role="alert">
            {view.storageError}
          </p>
        )}
        <p className="hint">
          {view?.slots.updatedAt
            ? `最終保存：${view.slots.updatedAt}（UTC）`
            : 'まだ保存はありません。'}{' '}
          ブラウザのサイトデータ削除で保存も消えます。
        </p>
      </section>

      <section className="panel game-log">
        <h2>直近の試合経過</h2>
        <ol>
          {view?.recentEvents.map((event) => (
            <li key={event.eventSeq}>
              <span>
                {event.before.inning}回{event.before.half === 'top' ? '表' : '裏'}
              </span>{' '}
              {eventText(event)}
            </li>
          ))}
        </ol>
      </section>
      <details className="panel">
        <summary>試作の対応範囲</summary>
        <p>
          9回、最大12回、同点引き分け、サヨナラ、DH、打席間の自動継投。四死球・三振・単打・二塁打・三塁打・本塁打・打球アウトを生成します。
        </p>
        <p>
          数式・係数は未校正です。失策、盗塁、犠打・犠飛、併殺、振り逃げ、暴投・捕逸、投手の勝敗・セーブは未対応です。試合中保存・シーズン進行・全世界セーブではありません。
        </p>
      </details>
      <footer>
        <p>
          {state?.simulationVersion ?? 'game-prototype-v1'} / 架空データ / 旧モデルの保存にも対応
        </p>
        <p>投球回の小数部分はアウト数です（例：5.2＝5回2/3）。表示や一時停止は乱数を進めません。</p>
      </footer>
    </main>
  );
}

export function GameApp() {
  const [tab, setTab] = useState<'game' | 'lab'>('game');
  return (
    <>
      <nav className="app-nav" aria-label="画面切替">
        <button aria-pressed={tab === 'game'} onClick={() => setTab('game')}>
          1試合シミュレーション
        </button>
        <button aria-pressed={tab === 'lab'} onClick={() => setTab('lab')}>
          1球の検証
        </button>
      </nav>
      <div hidden={tab !== 'game'}>
        <MatchGame />
      </div>
      {tab === 'lab' && <PitchLab />}
    </>
  );
}
