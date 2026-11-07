import { useEffect, useRef, useState } from 'react';
import type { TradeWorkerAction } from '../../world/trade-worker-client.ts';
import type { TradeWorkerResponse } from '../../world/trade-worker-protocol.ts';
import {
  MAX_TRADE_INITIAL_INPUT_BYTES,
  type TradeCreationSource,
  type TradeCreationSourceRef,
  type TradeCreationInspection,
} from '../../world/trade-creation-types.ts';

const slotNames = { auto: '自動保存', previousAuto: '直前の自動保存', manual: '手動保存' };
const sourceRef = (source: TradeCreationSource): TradeCreationSourceRef => ({
  localWorldId: source.localWorldId,
  slotKind: source.slotKind,
  snapshotId: source.snapshotId,
  storageRevision: source.storageRevision,
});
function downloadTemplate(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'trade-initial-input.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** 金額や資格の正本をUIで作らず、明示入力ファイルとWorkerの検査結果だけを扱う。 */
export function TradeCandidateCreation({
  reply,
  disabled,
  hasActive,
  previousId,
  onSend,
  onDirty,
}: {
  reply: TradeWorkerResponse | null;
  disabled: boolean;
  hasActive: boolean;
  previousId: string;
  onSend: (action: TradeWorkerAction, message: string) => Promise<TradeWorkerResponse | undefined>;
  onDirty: (value: boolean) => void;
}) {
  const [sources, setSources] = useState<TradeCreationSource[] | null>(null);
  const [selectedIndex, setSelectedIndex] = useState('');
  const [inputText, setInputText] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [inspection, setInspection] = useState<TradeCreationInspection | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileTicket = useRef(0);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const creation = reply?.creation;
  const selected = selectedIndex === '' ? undefined : sources?.[Number(selectedIndex)];
  const editable = !disabled && !hasActive && !creation && !confirmClear;
  useEffect(() => {
    onDirty(!!inputText && creation?.state !== 'created');
    return () => onDirty(false);
  }, [inputText, creation?.state, onDirty]);
  useEffect(() => {
    setAcknowledged(false);
  }, [creation?.creationId, creation?.state]);
  useEffect(
    () => () => {
      fileTicket.current++;
    },
    [],
  );

  function resetFile() {
    fileTicket.current++;
    setInputText('');
    setFilename('');
    setInspection(null);
    setError('');
    setAcknowledged(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  useEffect(() => {
    if (hasActive) resetFile();
  }, [hasActive]);

  async function readFile(file: File) {
    const ticket = ++fileTicket.current;
    setError('');
    setInspection(null);
    setInputText('');
    setFilename('');
    try {
      if (file.size > MAX_TRADE_INITIAL_INPUT_BYTES)
        throw new Error('初期入力ファイルは2MiB以下にしてください。');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (ticket === fileTicket.current) {
        setInputText(text);
        setFilename(file.name);
      }
    } catch (failure) {
      if (ticket === fileTicket.current)
        setError(failure instanceof Error ? failure.message : 'ファイルを読み込めませんでした。');
    }
  }
  async function listSources() {
    resetFile();
    const result = await onSend(
      { kind: 'listCandidateSources' },
      '元にする通常保存の一覧を読み込みました。',
    );
    if (result?.ok && result.creationSources) {
      setSources(result.creationSources);
      setSelectedIndex('');
    }
  }
  async function template() {
    if (!selected) return;
    const result = await onSend(
      { kind: 'getCandidateInitialTemplate', source: sourceRef(selected) },
      '未入力のひな型を出力しました。保存や契約の作成は行っていません。',
    );
    if (result?.ok && result.initialTemplate) downloadTemplate(result.initialTemplate.text);
  }
  async function inspect() {
    if (!selected || !inputText) return;
    setInspection(null);
    setAcknowledged(false);
    const result = await onSend(
      {
        kind: 'inspectCandidateCreation',
        source: sourceRef(selected),
        inputText,
        creationId: crypto.randomUUID(),
      },
      '初期入力の検査結果を表示しました。まだ保存していません。',
    );
    if (result?.ok && result.creationInspection) setInspection(result.creationInspection);
  }
  async function create() {
    if (!creation || !acknowledged) return;
    const result = await onSend(
      { kind: 'createCandidate', creationId: creation.creationId },
      '候補の初回保存を確認しました。準備を閉じ、保存済み候補の一覧から開いてください。',
    );
    if (result?.ok && result.creation?.state === 'created')
      await onSend({ kind: 'listCandidates' }, '保存済み候補の一覧を更新しました。');
  }
  async function clear() {
    if (!creation) return;
    const result = await onSend(
      { kind: 'clearCandidateCreation', creationId: creation.creationId },
      '作成準備を閉じました。保存済みのプレイや候補は削除していません。',
    );
    if (result?.ok) {
      setConfirmClear(false);
      resetFile();
    }
  }
  return (
    <section className="trade-play-section" aria-labelledby="candidate-creation-title">
      <h2 id="candidate-creation-title">初期入力から新しい候補を作成</h2>
      <p>
        通常プレイの保存を保持したまま、契約・資金・選手資格を明示した別候補を追加します。元にできるのは世界v21・当日の全試合開始前の保存です。通常プレイの未保存の進行は取り込みません。
      </p>
      {hasActive && <p>先に現在の候補を保存して閉じてください。</p>}
      {previousId && previousId !== creation?.localWorldId && (
        <p>
          前回の作成確認先：<code>{previousId}</code>
          。通信中断があった場合は、保存済み候補の一覧でこのIDを確認してください。
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="trade-play-actions">
        <button
          className="secondary"
          disabled={!editable || !!inputText}
          onClick={() => void listSources()}
        >
          元保存の一覧を取得
        </button>
      </div>
      {sources?.length === 0 && (
        <p>
          元にできる通常保存がありません。本画面で通常プレイを作成・保存してから、この一覧を取得してください。
        </p>
      )}
      <label>
        元にするプレイ・保存時点
        <select
          disabled={!editable || !!inputText || !sources?.length}
          value={selectedIndex}
          onChange={(e) => {
            resetFile();
            setSelectedIndex(e.target.value);
          }}
        >
          <option value="">保存時点を選択</option>
          {sources?.map((source, i) => (
            <option
              key={source.localWorldId + ':' + source.slotKind}
              value={i}
              disabled={!source.supported}
            >
              {source.label} ／ {source.gameDate} ／ {slotNames[source.slotKind]}
              {source.supported ? '' : '（未対応の世界版・参照）'}
            </option>
          ))}
        </select>
      </label>
      <div className="trade-play-actions">
        <button
          className="secondary"
          disabled={!editable || !selected || !!inputText}
          onClick={() => void template()}
        >
          未入力のJSONひな型をダウンロード
        </button>
      </div>
      <details>
        <summary>入力が必要なデータ</summary>
        <p>
          全選手の投打役割・外国人枠資格、当年度契約と給与債務、全球団の確定残高・現金明細・仮確保・将来予算を入力します。ひな型のnullは未入力です。0円や空配列は、実際に0・対象なしと分かっている場合だけ指定してください。
        </p>
        <p>
          選手のlabelは入力時の参照用で、保存内の選手名は変更しません。内部の交渉承認や取引をファイルから追加することはできません。
        </p>
      </details>
      <label>
        記入した初期入力JSON（UTF-8・2MiB以下）
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          disabled={!editable || !selected}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void readFile(file);
          }}
        />
      </label>
      {filename && (
        <p>
          選択中：{filename} ／ 元保存の版 {selected?.storageRevision}
        </p>
      )}
      <div className="trade-play-actions">
        <button
          className="primary"
          disabled={!editable || !inputText || !selected}
          onClick={() => void inspect()}
        >
          初期データを検査（保存しない）
        </button>
        <button className="secondary" disabled={!editable || !inputText} onClick={resetFile}>
          入力ファイルを外す
        </button>
      </div>
      {inspection?.status === 'blocked' && (
        <div role="alert">
          <h3>初期入力に未入力があります：{inspection.issueCount}件</h3>
          <ul>
            {inspection.issues.map((issue) => (
              <li key={issue.path}>
                <code>{issue.path}</code>：{issue.message}
              </li>
            ))}
          </ul>
          {inspection.issueCount > inspection.issues.length && (
            <p>先頭{inspection.issues.length}件を表示しています。</p>
          )}
        </div>
      )}
      {creation && (
        <div className="trade-roster-review">
          <h3>
            {creation.state === 'created'
              ? '候補の初回保存を確認しました'
              : creation.state === 'uncertain'
                ? '作成の成否を確認してください'
                : '検査した初期入力を確認'}
          </h3>
          <p>
            {creation.summary.controlledClub} ／ {creation.summary.date} ／{' '}
            {creation.summary.clubCount}球団・{creation.summary.playerCount}選手・契約年度
            {creation.summary.contractCount}件
          </p>
          <p>
            作成先ID：<code>{creation.localWorldId}</code>
          </p>
          <div className="table-scroll">
            <table aria-label="新規候補の初期予算">
              <thead>
                <tr>
                  <th>球団</th>
                  <th>計算上の現金</th>
                  <th>計算上の予算余力</th>
                </tr>
              </thead>
              <tbody>
                {creation.summary.budgets.map((budget) => (
                  <tr key={budget.clubId}>
                    <th scope="row">{budget.name}</th>
                    <td>{budget.cashYen.toLocaleString('ja-JP')}円</td>
                    <td>{budget.availableYen.toLocaleString('ja-JP')}円</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {creation.state !== 'created' && (
            <>
              <label className="trade-creation-ack">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={disabled}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                元保存と入力内容を確認し、別候補として保存する
              </label>
              <button
                className="primary"
                disabled={disabled || !acknowledged || confirmClear}
                onClick={() => void create()}
              >
                {creation.state === 'uncertain'
                  ? '同じ作成IDで保存結果を確認・再試行'
                  : 'この入力で候補を作成・初回保存'}
              </button>
            </>
          )}
          {creation.state === 'uncertain' && (
            <p>
              別の作成IDで再作成する前に、保存済み候補の一覧で作成先IDを確認してください。同じIDの再試行で既存の進行を上書きしません。
            </p>
          )}
          <button
            className="secondary"
            disabled={disabled || confirmClear}
            onClick={() => setConfirmClear(true)}
          >
            作成準備を閉じる（候補は削除しない）
          </button>
        </div>
      )}
      {confirmClear && (
        <section
          className="trade-play-confirm"
          role="alertdialog"
          aria-labelledby="creation-clear-title"
        >
          <h3 id="creation-clear-title">作成準備を閉じますか？</h3>
          <p>
            未保存の準備を破棄します。保存済み候補は残ります。成否不明の場合は、一覧で作成先IDを確認してから閉じてください。
          </p>
          <div className="trade-play-actions">
            <button
              className="secondary"
              disabled={disabled}
              autoFocus
              onClick={() => setConfirmClear(false)}
            >
              キャンセル
            </button>
            <button className="primary" disabled={disabled} onClick={() => void clear()}>
              確認して準備を閉じる
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
