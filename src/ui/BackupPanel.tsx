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
export function BackupPanel({
  view,
  plays,
  importedId,
  disabled,
  exportFile,
  importFile,
  openPlay,
  refresh,
}: Props) {
  const [slot, setSlot] = useState<WorldSlotKind>('manual');
  const [file, setFile] = useState<File | null>(null);
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
  return (
    <details className="backup-panel">
      <summary>ファイルのバックアップ・別プレイの復元</summary>
      <p>現在のプレイ：{current?.label ?? '初期プレイ'}</p>
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
      <button disabled={disabled || !view.slots[slot]} onClick={() => exportFile(slot)}>
        保存ファイルを書き出す
      </button>
      <label>
        取り込む保存ファイル
        <input
          type="file"
          accept=".bssave,application/zip"
          disabled={disabled}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <button disabled={disabled || !file} onClick={() => file && importFile(file)}>
        別プレイとして取り込む
      </button>
      <p className="hint">
        取り込みは元の保存と現在の作業を保持します。内容を検査して別プレイを追加し、進行を再開するときは下の一覧から開きます。
      </p>
      <label>
        保存済みプレイ
        <select
          aria-label="保存済みプレイ"
          value={chosen}
          disabled={disabled}
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
        開く保存枠
        <select
          aria-label="開く保存枠"
          value={actualSlot ?? ''}
          disabled={disabled || !target}
          onChange={(e) => setOpenSlot(e.target.value as WorldSlotKind)}
        >
          {!target && <option value="">保存枠を選択</option>}
          {target?.slots.map((kind) => (
            <option key={kind} value={kind}>
              {names[kind]}
            </option>
          ))}
        </select>
      </label>
      <div className="world-controls">
        <button
          disabled={
            disabled || !target || !actualSlot || (view.unsavedChanges && view.revision > 0)
          }
          onClick={() => actualSlot && openPlay(chosen, actualSlot)}
        >
          選んだプレイを開く
        </button>
        <button className="secondary" disabled={disabled} onClick={refresh}>
          プレイ一覧を更新
        </button>
      </div>
      {view.unsavedChanges && view.revision > 0 && (
        <p className="hint">切り替える前に、現在の作業を手動保存してください。</p>
      )}
    </details>
  );
}
