import { useEffect, useRef, useState } from 'react';
import {
  createTradeWorkerClient,
  type TradeWorkerAction,
  type TradeWorkerClient,
} from '../../world/trade-worker-client.ts';
import type { TradeWorkerResponse } from '../../world/trade-worker-protocol.ts';
import type { TradeCandidateIndexEntry } from '../../world/trade-candidate-index.ts';
import { TradePlayPanel } from './TradePlayPanel.tsx';
import './trade-play.css';

function connectionStopped(client: TradeWorkerClient) {
  return client.connectionState === 'stopped';
}

type Confirmation = { message: string } & (
  { kind: 'request'; action: TradeWorkerAction; success: string } | { kind: 'restart' }
);

/** 正本を持たず、候補専用Workerの応答と未送信の入力だけを保持する。 */
export default function TradeCandidatesApp({
  onAttention,
}: {
  onAttention: (value: boolean) => void;
}) {
  const client = useRef<TradeWorkerClient | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  const [reply, setReply] = useState<TradeWorkerResponse | null>(null);
  const [candidates, setCandidates] = useState<TradeCandidateIndexEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  async function send(action: TradeWorkerAction, success: string) {
    const instance = client.current;
    if (!instance || pending.current || instance.connectionState !== 'idle') return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setConfirmation(null);
    try {
      const response = await instance.request(action);
      if (client.current !== instance) return;
      setReply(response);
      if (response.candidates) setCandidates(response.candidates);
      if (!response.ok) setError(response.error);
      else if (response.result?.status !== 'blocked') setMessage(success);
      return response;
    } catch (failure) {
      if (client.current === instance)
        setError(failure instanceof Error ? failure.message : '候補Workerへ接続できませんでした。');
    } finally {
      if (client.current === instance) {
        pending.current = false;
        setBusy(false);
        setStopped(connectionStopped(instance));
      }
    }
  }

  function connect() {
    unsubscribe.current?.();
    client.current?.dispose();
    client.current = null;
    pending.current = false;
    setReply(null);
    setCandidates(null);
    setDirty(false);
    setConfirmation(null);
    setStopped(false);
    setBusy(false);
    setError('');
    setMessage('');
    try {
      const instance = createTradeWorkerClient();
      client.current = instance;
      unsubscribe.current = instance.subscribe(() => {
        if (client.current !== instance) return;
        if (instance.connectionState === 'stopped') {
          setStopped(true);
          setBusy(false);
          setMessage('');
          setError(
            '通信が停止しました。送信済み操作を自動再送せず、保存から再開して成否を確認してください。',
          );
        }
      });
      void send({ kind: 'listCandidates' }, '保存済みの候補一覧を読み込みました。');
    } catch (failure) {
      setStopped(true);
      setError(failure instanceof Error ? failure.message : '候補Workerを起動できませんでした。');
    }
  }

  useEffect(() => {
    connect();
    return () => {
      unsubscribe.current?.();
      const instance = client.current;
      client.current = null;
      instance?.dispose();
    };
  }, []);

  const active = reply?.active;
  const view = reply?.view;
  const attention =
    busy ||
    dirty ||
    !!view?.saveState.pendingCommands ||
    !!active?.reloadRequired ||
    (stopped && !!active);
  useEffect(() => {
    onAttention(attention);
    if (!attention) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attention, onAttention]);

  function withDraftCheck(action: TradeWorkerAction, success: string) {
    if (dirty)
      setConfirmation({
        kind: 'request',
        action,
        success,
        message: '未送信の登録・編成・固定希望を破棄して、この操作を行いますか？',
      });
    else void send(action, success);
  }
  const canSwitch = !active || !!view?.capabilities.canSwitch;
  const blocked = reply?.result?.status === 'blocked' ? reply.result : null;

  return (
    <main className="trade-play world-page">
      <header>
        <div className="eyebrow">DEVELOPMENT / CANDIDATE PLAY</div>
        <h1>候補プレイ</h1>
        <p>移籍対応の試作保存を再開します。通常プレイとは別の保存です。</p>
      </header>
      <div className="trade-play-feedback" aria-live="polite" aria-atomic="true">
        {busy && <p role="status">処理中です。応答を待っています…</p>}
        {message && <p role="status">{message}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {blocked && (
          <div role="alert">
            <p>{blocked.reason}</p>
            <ul>
              {blocked.issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {confirmation && (
        <section
          className="trade-play-confirm"
          role="alertdialog"
          aria-labelledby="candidate-confirm-title"
        >
          <h2 id="candidate-confirm-title">保存・下書きの確認</h2>
          <p>{confirmation.message}</p>
          <div className="trade-play-actions">
            <button
              className="secondary"
              autoFocus
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              キャンセル
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                const chosen = confirmation;
                setConfirmation(null);
                if (chosen.kind === 'restart') connect();
                else void send(chosen.action, chosen.success);
              }}
            >
              確認して実行
            </button>
          </div>
        </section>
      )}
      {stopped && (
        <section className="trade-play-section">
          <h2>保存から接続し直す</h2>
          <p>
            未保存の試合進行と下書きを破棄します。保存済み操作の成否は、候補を開き直して確認してください。
          </p>
          <button
            className="secondary"
            disabled={busy || !!confirmation}
            onClick={() =>
              setConfirmation({
                kind: 'restart',
                message:
                  '現在の接続と未保存の作業を破棄し、新しい接続で保存一覧を読み込みます。送信済み操作は再送しません。続けますか？',
              })
            }
          >
            新しい接続で保存一覧へ
          </button>
        </section>
      )}
      <section className="trade-play-section" aria-labelledby="candidate-list-title">
        <div className="trade-play-heading">
          <h2 id="candidate-list-title">保存済み候補</h2>
          <button
            className="secondary"
            disabled={busy || stopped || !!confirmation}
            onClick={() => void send({ kind: 'listCandidates' }, '候補一覧を更新しました。')}
          >
            一覧を更新
          </button>
        </div>
        <p className="muted">
          一覧は保存の目録です。「開く」で全データを復元・検査します。保存時点の切替は工事中です。
        </p>
        {candidates?.length === 0 && (
          <p>
            保存済み候補はありません。通常プレイや初期データ候補を自動変換することはありません。
          </p>
        )}
        {!!candidates?.length && (
          <div className="table-scroll">
            <table aria-label="保存済み候補一覧">
              <thead>
                <tr>
                  <th>プレイ</th>
                  <th>保存内日付</th>
                  <th>状態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.localWorldId}>
                    <th scope="row">
                      {candidate.label}
                      <small className="trade-play-id">{candidate.localWorldId}</small>
                    </th>
                    <td>{candidate.gameDate ?? '不明'}</td>
                    <td>
                      {candidate.status === 'indexed'
                        ? '目録参照を確認'
                        : (candidate.error ?? '読込不可')}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={
                          busy ||
                          stopped ||
                          !!confirmation ||
                          !canSwitch ||
                          candidate.status !== 'indexed'
                        }
                        onClick={() =>
                          withDraftCheck(
                            { kind: 'openCandidate', localWorldId: candidate.localWorldId },
                            '選択中の保存から再開しました。',
                          )
                        }
                      >
                        {candidate.localWorldId === active?.localWorldId
                          ? '保存から開き直す'
                          : '開く'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!canSwitch && (
          <p>別の候補へ切り替えるには、試合進行を保存するか、保存から再読込してください。</p>
        )}
        <details>
          <summary>新規作成などの未対応機能</summary>
          <p>
            初期契約・資金データに基づく新規作成、交渉・承認の生成、複数手動枠・保存ファイルの入出力は工事中です。
          </p>
          <button className="secondary" disabled>
            新しい候補を作成（工事中）
          </button>
        </details>
      </section>
      {active && (
        <section className="trade-play-section" aria-label="候補の保存操作">
          <h2>保存と再読込</h2>
          <p>
            状態版 {active.stateRevision} ／ 保存版 {active.storageRevision}
            {view &&
              ` ／ 未保存の試合指示 ${view.saveState.pendingCommands} / ${view.saveState.commandLimit}`}
          </p>
          {(active.reloadRequired || stopped) && (
            <p role="alert">
              この表示のまま続行できません。保存の成否を確認するため再開してください。
            </p>
          )}
          <div className="trade-play-actions">
            <button
              className="primary"
              disabled={busy || stopped || !!confirmation || !view?.capabilities.canSaveManual}
              onClick={() =>
                void send(
                  {
                    kind: 'saveCandidateManual',
                    sessionId: active.sessionId,
                    expectedStateRevision: active.stateRevision,
                  },
                  '試合途中の状態を手動1枠へ保存しました。登録・編成・固定希望の未送信入力は保存しません。',
                )
              }
            >
              試合進行を手動保存
            </button>
            <button
              className="secondary"
              disabled={busy || stopped || !!confirmation}
              onClick={() =>
                setConfirmation({
                  kind: 'request',
                  action: {
                    kind: 'reloadCandidate',
                    sessionId: active.sessionId,
                    expectedStateRevision: active.stateRevision,
                  },
                  success: '選択中の保存から読み込み直しました。',
                  message:
                    '未保存の試合進行と登録・編成・固定希望の下書きを破棄し、選択中の保存から読み込み直します。よろしいですか？',
                })
              }
            >
              保存から再読込
            </button>
            <button
              className="secondary"
              disabled={busy || stopped || !!confirmation || !view?.capabilities.canSwitch}
              onClick={() =>
                withDraftCheck(
                  {
                    kind: 'closeCandidate',
                    sessionId: active.sessionId,
                    expectedStateRevision: active.stateRevision,
                  },
                  '候補を閉じました。保存は保持しています。',
                )
              }
            >
              候補を閉じる
            </button>
          </div>
          <p className="muted">
            試合進行は自動保存しません。日次確定と固定希望の反映は自動保存後に表示します。タブを移動しても作業中の候補は保持します。
          </p>
        </section>
      )}
      {active && view && (
        <TradePlayPanel
          key={`${active.sessionId}:${active.stateRevision}`}
          active={active}
          view={view}
          disabled={busy || stopped || !!confirmation || active.reloadRequired}
          onDraftChange={setDirty}
          onSend={send}
        />
      )}
    </main>
  );
}
