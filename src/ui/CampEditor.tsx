import { useState } from 'react';
import { canonicalJson } from '../storage/codec.ts';
import { trainingChanges, trainingTargetOptions } from '../world/training.ts';
import type { WorldView } from '../world/controller.ts';
import type { CampDraft } from '../world/camp-types.ts';
import type { TrainingSettings } from '../world/training-types.ts';

export interface CampEditorProps {
  draft: CampDraft;
  base: CampDraft;
  onChange: (next: CampDraft) => void;
  onSave: (campId: string) => void;
  onReset: (campId: string) => void;
}
const INTENSITIES = { light: '軽め', normal: '普通', hard: '強め', rest: '休養' };
/** 左の選手選択を共有し、通常練習と独立したキャンプの下書きを編集する。 */
export function CampEditor({
  view,
  selected,
  locked,
  ...props
}: CampEditorProps & { view: WorldView; selected: string[]; locked: boolean }) {
  const [chosen, setChosen] = useState('');
  if (!view.camp) return null;
  const period = view.camp.periods.find((p) => p.campId === chosen) ?? view.camp.periods[0]!;
  const plans = props.draft[period.campId]!;
  const same = <T,>(values: T[]): T | undefined =>
    values.length && values.every((v) => canonicalJson(v) === canonicalJson(values[0]))
      ? values[0]
      : undefined;
  const rows = selected.map((id) => plans[id]!);
  const target = same(rows.map((p) => p.target));
  const intensity = same(rows.map((p) => p.intensity));
  const autoAdjust = same(rows.map((p) => p.autoAdjustForFatigue));
  const options = selected.length
    ? trainingTargetOptions(
        view.definitions,
        selected[0]!,
        view.growth?.pitchLearning?.acquisition,
      ).filter((o) =>
        selected
          .slice(1)
          .every((id) =>
            trainingTargetOptions(
              view.definitions,
              id,
              view.growth?.pitchLearning?.acquisition,
            ).some((other) => other.key === o.key),
          ),
      )
    : [];
  const changed = trainingChanges(props.base[period.campId]!, plans).length > 0;
  const ended = view.currentDate > period.through;
  function patch(settings: Partial<TrainingSettings>) {
    const next = structuredClone(props.draft);
    for (const id of selected)
      next[period.campId]![id] = { ...next[period.campId]![id]!, ...structuredClone(settings) };
    props.onChange(next);
  }
  return (
    <section className="camp-editor" aria-label="キャンプ専用設定">
      <h4>キャンプ専用メニュー</h4>
      <label>
        キャンプ期間
        <select value={period.campId} onChange={(e) => setChosen(e.target.value)}>
          {view.camp.periods.map((p) => (
            <option key={p.campId} value={p.campId}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        <time>{period.from}</time>〜<time>{period.through}</time>
      </p>
      <p className="hint">
        {!view.camp.enabled
          ? 'このプレイではキャンプを無効にしています。'
          : ended
            ? '終了・閲覧のみ'
            : view.currentDate < period.from
              ? '開始前'
              : 'キャンプ中'}{' '}
        ／ {changed ? 'キャンプ設定を編集中' : 'キャンプ設定は保存済み'}
      </p>
      <fieldset disabled={locked || ended || !view.camp.enabled || !selected.length}>
        <legend>選択中の{selected.length}人に適用</legend>
        <label>
          キャンプ練習対象
          <select
            value={target ? canonicalJson(target) : ''}
            onChange={(e) => {
              const o = options.find((o) => o.key === e.target.value);
              if (o) patch({ target: o.target });
            }}
          >
            {!target && (
              <option value="">
                {selected.length ? '設定が異なります（変更しない）' : '選手を選んでください'}
              </option>
            )}
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          キャンプ練習強度
          <select
            value={intensity ?? ''}
            onChange={(e) => {
              if (Object.hasOwn(INTENSITIES, e.target.value))
                patch({ intensity: e.target.value as TrainingSettings['intensity'] });
            }}
          >
            {!intensity && <option value="">設定が異なります（変更しない）</option>}
            {Object.entries(INTENSITIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          キャンプの疲労自動調整
          <select
            value={autoAdjust === undefined ? '' : String(autoAdjust)}
            onChange={(e) => {
              if (e.target.value) patch({ autoAdjustForFatigue: e.target.value === 'true' });
            }}
          >
            {autoAdjust === undefined && <option value="">設定が異なります（変更しない）</option>}
            <option value="true">許可する</option>
            <option value="false">手動指定を維持する</option>
          </select>
        </label>
      </fieldset>
      <div className="world-controls">
        <button disabled={locked || ended || !changed} onClick={() => props.onSave(period.campId)}>
          キャンプ設定を保存
        </button>
        <button
          className="secondary"
          disabled={locked || !changed}
          onClick={() => props.onReset(period.campId)}
        >
          キャンプの変更を取り消す
        </button>
      </div>
      <p className="hint">
        期間中だけこの指定を使い、終了後は保存済みの通常練習へ戻ります。別画面へ移る際も保存します。期間・補正・爆発は未校正の試作規則です。
      </p>
    </section>
  );
}
