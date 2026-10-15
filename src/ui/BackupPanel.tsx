import { useEffect, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { StoredPlay, WorldSlotKind } from '../world/storage.ts';

const names: Record<WorldSlotKind, string> = {
  auto: '自動保存',
  previousAuto: '直前の自動保存',
  manual: '手動保存',
};
interface Props {
  view: WorldView;
  plays: StoredPlay[];
  importedId: string;
  disabled: boolean;
  exportFile: (slot: WorldSlotKind) => void;
  importFile: (file: File) => void;
  openPlay: (localWorldId: string, slot: WorldSlotKind) => void;
  refresh: () => void;
}
export function SavedPlayPicker({
  view,
  plays,
  importedId,
  disabled,
  openPlay,
  refresh,
}: Omit<Props, 'exportFile' | 'importFile'>) {
  const [chosen, setChosen] = useState('');
  const [openSlot, setOpenSlot] = useState<WorldSlotKind>('manual');
  useEffect(() => {
    if (importedId) {
      setChosen(importedId);
      setOpenSlot('manual');
    }
  }, [importedId]);
  const target = plays.find((p) => p.localWorldId === chosen);
  const current = plays.find((p) => p.localWorldId === view.localWorldId);
  const actualSlot = target?.slots.includes(openSlot) ? openSlot : target?.slots[0];
  const needsSave = view.unsavedChanges && view.revision > 0;
  const resumeHint = disabled
    ? '処理が終わるか、進行を一時停止してから開けます。'
    : needsSave
      ? '切り替える前に、現在の作業を手動保存してください。'
      : plays.length === 0
        ? '保存したプレイはまだありません。現在の作業を保存するか、「新規プレイ」から始めてください。'
        : !target
          ? 'プレイと保存枠を選ぶと、再開できるようになります。'
          : !actualSlot
            ? 'このプレイには開ける保存枠がありません。'
            : '「選んだプレイを開く」で、選択した保存時点に切り替わります。';

  return (
    <section className="workflow-group" aria-labelledby="resume-heading">
      <h3 id="resume-heading">保存したプレイを再開</h3>
      <p className="hint">現在のプレイ：{current?.label ?? '初期プレイ'}</p>
      <div className="workflow-fields">
        <label>
          1. 保存済みプレイ
          <select
            aria-label="保存済みプレイ"
            value={chosen}
            disabled={disabled || plays.length === 0}
            onChange={(e) => {
              setChosen(e.target.value);
              setOpenSlot('manual');
            }}
          >
            <option value="">開くプレイを選択</option>
            {plays.map((p) => (
              <option key={p.localWorldId} value={p.localWorldId}>
                {p.label}（{p.gameDate ?? '日付なし'}）
              </option>
            ))}
          </select>
        </label>
        <label>
          2. 開く保存枠
          <select
            aria-label="開く保存枠"
            value={actualSlot ?? ''}
            disabled={disabled || !target}
            onChange={(e) => setOpenSlot(e.target.value as WorldSlotKind)}
          >
            {!target && <option value="">先にプレイを選択</option>}
            {target?.slots.map((kind) => (
              <option key={kind} value={kind}>
                {names[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="action-hint" id="resume-hint">
        {resumeHint}
      </p>
      <div className="world-controls">
        <button
          disabled={disabled || !target || !actualSlot || needsSave}
          aria-describedby="resume-hint"
          onClick={() => actualSlot && openPlay(chosen, actualSlot)}
        >
          選んだプレイを開く
        </button>
        <button className="secondary" disabled={disabled} onClick={refresh}>
          プレイ一覧を更新
        </button>
      </div>
    </section>
  );
}

export function BackupPanel({
  view,
  disabled,
  exportFile,
  importFile,
}: Pick<Props, 'view' | 'disabled' | 'exportFile' | 'importFile'>) {
  const [slot, setSlot] = useState<WorldSlotKind>('manual');
  const [file, setFile] = useState<File | null>(null);

  return (
    <details className="backup-panel workflow-disclosure">
      <summary>ファイルのバックアップ・別プレイの復元</summary>
      <div className="backup-workflows">
        <section aria-labelledby="export-heading">
          <h3 id="export-heading">保存ファイルを書き出す</h3>
          <p className="hint">
            書き出すのは保存済みの時点です。未保存の変更を含める場合は、先に「世界を手動保存」を押してください。
          </p>
          <label>
            書き出す保存枠
            <select
              aria-label="書き出す保存枠"
              value={slot}
              disabled={disabled}
              onChange={(e) => setSlot(e.target.value as WorldSlotKind)}
            >
              {(['manual', 'auto', 'previousAuto'] as const).map((kind) => (
                <option key={kind} value={kind}>
                  {names[kind]}：{view.slots[kind]?.gameDate ?? '保存なし'}
                </option>
              ))}
            </select>
          </label>
          <p className="action-hint" id="export-hint">
            {disabled
              ? '処理が終わるか、進行を一時停止してから書き出せます。'
              : view.slots[slot]
                ? '選んだ保存時点を .bssave ファイルとしてダウンロードします。'
                : 'この枠には保存がありません。保存済みの枠を選ぶか、先に手動保存してください。'}
          </p>
          <div className="world-controls">
            <button
              className="secondary"
              disabled={disabled || !view.slots[slot]}
              aria-describedby="export-hint"
              onClick={() => exportFile(slot)}
            >
              保存ファイルを書き出す
            </button>
          </div>
        </section>
        <section aria-labelledby="import-heading">
          <h3 id="import-heading">別プレイとして取り込む</h3>
          <label>
            取り込む保存ファイル
            <input
              type="file"
              accept=".bssave,application/zip"
              disabled={disabled}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="action-hint" id="import-hint">
            {disabled
              ? '処理が終わるか、進行を一時停止してから取り込めます。'
              : file
                ? '選んだファイルを検査し、元の保存と現在の作業を残して追加します。'
                : '先に .bssave ファイルを選択してください。'}
          </p>
          <div className="world-controls">
            <button
              className="secondary"
              disabled={disabled || !file}
              aria-describedby="import-hint"
              onClick={() => file && importFile(file)}
            >
              別プレイとして取り込む
            </button>
          </div>
          <p className="hint">取り込み後は、この画面の「保存したプレイを再開」から開きます。</p>
        </section>
      </div>
    </details>
  );
}
