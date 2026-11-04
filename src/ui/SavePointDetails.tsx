import type { StoredSavePoint } from '../world/storage.ts';

const dateTime = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

/** 実時刻は表示専用。ゲーム計算や再開先の選択には使用しない。 */
function SavedTime({ value }: { value: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <>日時未取得</>;
  return <time dateTime={value}>{dateTime.format(new Date(value))}</time>;
}

export function SavePointDetails({ point }: { point: StoredSavePoint }) {
  return (
    <section className="save-point-details" aria-label="選んだ保存時点" aria-live="polite">
      <h4>選んだ保存時点</h4>
      <dl>
        <div>
          <dt>ゲーム内日付</dt>
          <dd>
            <time dateTime={point.gameDate}>{point.gameDate}</time>
          </dd>
        </div>
        <div>
          <dt>この端末への保存日時</dt>
          <dd>
            <SavedTime value={point.updatedAt} />
          </dd>
        </div>
      </dl>
      <details>
        <summary>保存データの確認情報</summary>
        <dl>
          <div>
            <dt>保存データ作成日時</dt>
            <dd>
              <SavedTime value={point.createdAt} />
            </dd>
          </div>
          <div>
            <dt>保存形式</dt>
            <dd>{point.saveFormatVersion ?? '目録未取得'}</dd>
          </div>
          <div>
            <dt>計算モデル</dt>
            <dd>{point.simulationVersion ?? '目録未取得'}</dd>
          </div>
          <div>
            <dt>保存時のアプリ版</dt>
            <dd>記録なし</dd>
          </div>
        </dl>
        <p className="hint">
          表示は保存の目録情報です。内容と互換性は、開くときに検査します。取り込み時の端末への保存日時と、元の保存データ作成日時は異なる場合があります。
        </p>
      </details>
    </section>
  );
}
