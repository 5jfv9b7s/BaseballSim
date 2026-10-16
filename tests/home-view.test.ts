import test from 'node:test';
import assert from 'node:assert/strict';
import { homeStarter, type HomeGame } from '../src/ui/home-view.ts';

const scheduled: HomeGame = {
  gameId: 'game-today',
  date: '2026-09-24',
  statScope: 'firstRegular',
  awaySquadId: 'club-away',
  homeSquadId: 'club-home',
  status: 'scheduled',
  score: null,
  totalPitches: 0,
  result: null,
  display: null,
  lineups: null,
  startingPitchers: null,
};
const preview = { gameId: scheduled.gameId, starterId: 'candidate' };

test('ホーム先発：今日の自球団だけにWorkerの候補を表示する', () => {
  assert.deepEqual(homeStarter(scheduled, 'away', 'club-away', preview), {
    playerId: 'candidate',
    label: '先発候補',
  });
  assert.deepEqual(homeStarter(scheduled, 'home', 'club-away', preview), {
    playerId: null,
    label: '先発未確定',
  });
  assert.deepEqual(homeStarter(scheduled, 'home', 'club-home', preview), {
    playerId: 'candidate',
    label: '先発候補',
  });
});

test('ホーム先発：別日の候補、旧保存の候補なし、担当球団なしを流用しない', () => {
  for (const source of [null, { ...preview, gameId: 'another-game' }]) {
    assert.equal(homeStarter(scheduled, 'away', 'club-away', source).playerId, null);
  }
  assert.equal(homeStarter(scheduled, 'away', undefined, preview).playerId, null);
});

test('ホーム先発：試合開始後は両球団の実際の先発を候補より優先する', () => {
  for (const status of ['playing', 'completed', 'aborted'] as const) {
    const game = {
      ...scheduled,
      status,
      startingPitchers: { away: 'actual-away', home: 'actual-home' },
    };
    assert.deepEqual(homeStarter(game, 'away', 'club-away', preview), {
      playerId: 'actual-away',
      label: '先発投手',
    });
    assert.deepEqual(homeStarter(game, 'home', 'club-away', preview), {
      playerId: 'actual-home',
      label: '先発投手',
    });
  }
});

test('ホーム先発：開始後に確定情報が欠けても候補で補完しない', () => {
  for (const status of ['playing', 'completed', 'aborted'] as const) {
    assert.equal(
      homeStarter({ ...scheduled, status }, 'away', 'club-away', preview).playerId,
      null,
    );
  }
});
