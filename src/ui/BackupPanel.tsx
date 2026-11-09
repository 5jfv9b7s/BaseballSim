import { SavePointDetails } from './SavePointDetails.tsx';
import { useEffect, useId, useState } from 'react';
import { SaveSlotPicker } from './SaveSlots.tsx';
import './save-cards.css';
import type { WorldView } from '../world/controller.ts';
import type { StoredPlay, WorldSlotKind } from '../world/storage.ts';

/** 自動生成ラベルのISO作成時刻だけを見出しから省き、元の名前はツールチップと読上げに残す。 */
function playHeading(label: string): string {
  return label.replace(/ 作成 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, '');
}

interface Props {
  view: WorldView;
  plays: StoredPlay[];
  importedId: string;
  disabled: boolean;
  showCurrent?: boolean;
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
  showCurrent = true,
}: Omit<Props, 'exportFile' | 'importFile'>) {
  const [chosen, setChosen] = useState('');
  const playGroup = useId();
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
  const selectedPoint = actualSlot ? target?.slotDetails[actualSlot] : undefined;
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
      {showCurrent && (
        <p className="hint">現在のプレイ：{current ? playHeading(current.label) : '初期プレイ'}</p>
      )}
      <div className="save-browser">
        <fieldset className="save-choice-group" aria-label="保存済みプレイ" disabled={disabled}>
          <legend>1. 保存済みプレイ</legend>
          {plays.length > 0 ? (
            <div className="play-choice-grid">
              {plays.map((play) => (
                <label
                  className="save-choice play-choice"
                  key={play.localWorldId}
                  data-selected={chosen === play.localWorldId}
                >
                  <input
                    type="radio"
                    name={playGroup}
                    value={play.localWorldId}
                    aria-label={play.label}
                    checked={chosen === play.localWorldId}
                    onChange={() => {
                      setChosen(play.localWorldId);
                      setOpenSlot('manual');
                    }}
                  />
                  <span className="play-choice-title" title={play.label}>
                    {playHeading(play.label)}
                  </span>
                  <span className="play-choice-date">
                    {play.gameDate ? (
                      <time dateTime={play.gameDate}>{play.gameDate}</time>
                    ) : (
                      '日付未取得'
                    )}
                  </span>
                  <span className="play-choice-meta">
                    保存枠 {play.slots.length}件
                    {play.localWorldId === view.localWorldId && showCurrent ? ' ／ プレイ中' : ''}
                  </span>
                  <span className="save-choice-mark">
                    {chosen === play.localWorldId ? '選択中' : 'このプレイを選ぶ'}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="save-choice-empty">保存したプレイはまだありません。</p>
          )}
        </fieldset>
        <div className="save-browser-slots">
          {target ? (
            <SaveSlotPicker
              label="開く保存枠"
              points={Object.fromEntries(
                target.slots.map((slot) => [slot, target.slotDetails[slot] ?? null]),
              )}
              available={target.slots}
              value={actualSlot}
              disabled={disabled}
              onChange={setOpenSlot}
            />
          ) : (
            <p className="save-choice-prompt">プレイを選ぶと、3つの保存枠を表示します。</p>
          )}
        </div>
      </div>
      {selectedPoint && <SavePointDetails point={selectedPoint} />}
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
          <SaveSlotPicker
            label="書き出す保存枠"
            points={view.slots}
            value={slot}
            disabled={disabled}
            onChange={setSlot}
          />
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
