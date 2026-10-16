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
