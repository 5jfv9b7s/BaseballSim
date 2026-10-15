import type { CSSProperties } from 'react';
import home from './icons/home.svg';
import schedule from './icons/schedule.svg';
import lineup from './icons/lineup.svg';
import team from './icons/team.svg';
import stats from './icons/stats.svg';
import settings from './icons/settings.svg';

const icons = { home, schedule, lineup, team, stats, settings };
export type MenuIconName = keyof typeof icons;

/** ユーザー提供SVGをそのまま使い、色は親の文字色に合わせる。 */
export function MenuIcon({ name }: { name: MenuIconName }) {
  return (
    <i
      className="menu-icon"
      aria-hidden="true"
      style={{ '--menu-icon': `url("${icons[name]}")` } as CSSProperties}
    />
  );
}
