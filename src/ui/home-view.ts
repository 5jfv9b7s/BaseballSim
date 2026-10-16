import type { WorldView } from '../world/controller.ts';

export type HomeGame = WorldView['games'][number];

export const GAME_STATUS_LABELS: Record<HomeGame['status'], string> = {
  scheduled: '試合前',
  playing: '進行中',
  completed: '試合終了',
  aborted: '異常停止',
};

/** 表示する日の自球団の候補だけを採用。相手の先発をUIで推測しない。 */
export function homeStarter(
  game: HomeGame,
  side: 'away' | 'home',
  controlledSquadId: string | undefined,
  preview: Pick<NonNullable<WorldView['registrationPreview']>, 'gameId' | 'starterId'> | null,
): { playerId: string | null; label: string } {
  const confirmed = game.startingPitchers?.[side];
  if (confirmed) return { playerId: confirmed, label: '先発投手' };
  const squadId = side === 'away' ? game.awaySquadId : game.homeSquadId;
  if (
    game.status === 'scheduled' &&
    squadId === controlledSquadId &&
    preview?.gameId === game.gameId
  ) {
    return { playerId: preview.starterId, label: '先発候補' };
  }
  return { playerId: null, label: '先発未確定' };
}
