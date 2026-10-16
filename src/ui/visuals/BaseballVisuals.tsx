import type { CSSProperties } from 'react';
import { clubIdentity } from './club-identity.ts';
import './baseball-visuals.css';

export function clubStyle(clubId?: string): CSSProperties {
  return { '--club-color': clubIdentity(clubId).color } as CSSProperties;
}

/** 名前と併記する識別印。公式エンブレムの代用品だとは主張しない。 */
export function ClubMark({ clubId, small = false }: { clubId?: string; small?: boolean }) {
  return (
    <span className="club-mark" data-small={small} style={clubStyle(clubId)} aria-hidden="true">
      {clubIdentity(clubId).mark}
    </span>
  );
}

/** 背番号がない場合はダッシュ。選手IDや打順を背番号に流用しない。 */
export function UniformGraphic({ clubId, number }: { clubId?: string; number?: string }) {
  return (
    <svg
      className="uniform-graphic"
      style={clubStyle(clubId)}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <path
        className="uniform-body"
        d="M31 10 9 23 1 43 19 52 26 39 26 94 74 94 74 39 81 52 99 43 91 23 69 10 61 6 39 6Z"
      />
      <path
        className="uniform-trim"
        d="m31 10 8-4q11 16 22 0l8 4q-19 23-38 0ZM2 39l19 9-2 4L1 43Zm77 9 19-9 1 4-18 9Z"
      />
      <path className="uniform-seam" d="M50 24v15M30 87h40" />
      <text x="50" y="70" textAnchor="middle">
        {number ?? '—'}
      </text>
    </svg>
  );
}

/** 左がビジター、右がホーム。未実施の得点を0で埋めない。 */
export function MatchScore({
  away,
  home,
  awayName,
  homeName,
}: {
  away: number | null;
  home: number | null;
  awayName: string;
  homeName: string;
}) {
  const label =
    away === null || home === null
      ? '試合前・得点なし'
      : `${awayName} ${away} 対 ${home} ${homeName}`;
  return (
    <div className="match-score" role="img" aria-label={label}>
      <span aria-hidden="true">{away ?? '—'}</span>
      <span className="score-divider" aria-hidden="true">
        :
      </span>
      <span aria-hidden="true">{home ?? '—'}</span>
    </div>
  );
}
