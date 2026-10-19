import type { NewPlayCalendarOption } from '../world/league-structure-types.ts';
import './new-play-preview.css';

/** Workerが返す新規初期データの確認。読込中のプレイは変更しない。 */
export function NewPlayClubPreview({
  calendar,
  club,
}: {
  calendar?: NewPlayCalendarOption;
  club?: NewPlayCalendarOption['clubs'][number];
}) {
  if (!calendar || !club) return <p>新規プレイの球団情報を読み込んでいます。</p>;
  return (
    <section className="new-play-preview" aria-label="新規球団の確認">
      <h3>{club.displayName}</h3>
      <dl>
        <div>
          <dt>リーグ</dt>
          <dd>{club.leagueName}</dd>
        </div>
        <div>
          <dt>所在地</dt>
          <dd>{club.regionName}</dd>
        </div>
        <div>
          <dt>一軍本拠地</dt>
          <dd>{club.homeStadiumName}</dd>
        </div>
        <div>
          <dt>二軍本拠地</dt>
          <dd>{club.farmStadiumName}</dd>
        </div>
        <div>
          <dt>開始日</dt>
          <dd>
            <time dateTime={calendar.startDate}>{calendar.startDate}</time>
          </dd>
        </div>
        <div>
          <dt>終了日</dt>
          <dd>
            <time dateTime={calendar.endDate}>{calendar.endDate}</time>
          </dd>
        </div>
      </dl>
    </section>
  );
}
