import { useId } from 'react';
import { SavedTime } from './SavePointDetails.tsx';
import type { WorldSlot, WorldSlotKind } from '../world/storage.ts';
import './save-cards.css';

export const SAVE_SLOT_KINDS = ['manual', 'auto', 'previousAuto'] as const;
export const SAVE_SLOT_NAMES: Record<WorldSlotKind, string> = {
  manual: '手動保存',
  auto: '自動保存',
  previousAuto: '直前の自動保存',
};
const descriptions: Record<WorldSlotKind, string> = {
  manual: '自分で保存した時点',
  auto: '最新の自動保存時点',
  previousAuto: 'ひとつ前の自動保存時点',
};

/** 保存目録にある値だけを表示する。空き枠に日付やプレイ情報を補わない。 */
export function SaveSlotSummary({
  slot,
  point,
  available = !!point,
}: {
  slot: WorldSlotKind;
  point?: WorldSlot | null;
  available?: boolean;
}) {
  return (
    <span className="slot-card-content">
      <span className="slot-card-heading">
        <span className="slot-card-number" aria-hidden="true">
          0{SAVE_SLOT_KINDS.indexOf(slot) + 1}
        </span>
        <strong>{SAVE_SLOT_NAMES[slot]}</strong>
        <span className="slot-card-status">{available ? '保存あり' : '空き'}</span>
      </span>
      {point ? (
        <>
          <span className="slot-card-date">
            <time dateTime={point.gameDate}>{point.gameDate}</time>
          </span>
          <span className="slot-card-caption">ゲーム内日付</span>
          <span className="slot-card-time">
            端末への保存 <SavedTime value={point.updatedAt} />
          </span>
        </>
      ) : (
        <span className="slot-card-empty">
          {available ? '日付・保存日時は未取得' : '保存データはありません'}
        </span>
      )}
      <span className="slot-card-description">{descriptions[slot]}</span>
    </span>
  );
}

/** 選択だけを担当し、読込・書出しは別の確定ボタンで行う。 */
export function SaveSlotPicker({
  label,
  points,
  value,
  disabled,
  onChange,
  available,
}: {
  label: string;
  points: Partial<Record<WorldSlotKind, WorldSlot | null>>;
  value?: WorldSlotKind;
  available?: readonly WorldSlotKind[];
  disabled: boolean;
  onChange: (slot: WorldSlotKind) => void;
}) {
  const name = useId();
  return (
    <fieldset className="save-choice-group" aria-label={label} disabled={disabled}>
      <legend>{label}</legend>
      <div className="save-choice-grid">
        {SAVE_SLOT_KINDS.map((slot) => {
          const exists = available ? available.includes(slot) : !!points[slot];
          const selected = slot === value && exists;
          return (
            <label
              key={slot}
              className="save-choice slot-choice"
              data-selected={selected}
              data-empty={!exists}
            >
              <input
                type="radio"
                name={name}
                value={slot}
                aria-label={SAVE_SLOT_NAMES[slot]}
                checked={selected}
                disabled={!exists}
                onChange={() => onChange(slot)}
              />
              <SaveSlotSummary slot={slot} point={points[slot]} available={exists} />
              <span className="save-choice-mark">
                {selected ? '選択中' : exists ? 'この枠を選ぶ' : '選択できません'}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
