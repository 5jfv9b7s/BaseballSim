import { useEffect, useState } from 'react';
import type { TradePlayView } from '../../world/trade-play-view.ts';
import type { TradeWorkerAction } from '../../world/trade-worker-client.ts';
import type { TradeWorkerActive, TradeWorkerCommand } from '../../world/trade-worker-protocol.ts';
import type { RosterChangeMode, RosterPreference } from '../../world/roster-policy-types.ts';
import { AbilityRating } from '../visuals/AbilityRating.tsx';
import { MatchScore } from '../visuals/BaseballVisuals.tsx';
import { TradeBenchSelection } from './TradeBenchSelection.tsx';

const phaseLabels = {
  beforeGame: '試合開始前',
  playing: '試合進行中',
  dayComplete: '当日全試合終了',
  aborted: '異常停止',
  seasonComplete: '単年日程終了',
};
const statusLabels = {
  scheduled: '予定',
  completed: '終了',
  aborted: '異常停止',
  playing: '進行中',
};
const preferences: Record<RosterPreference, string> = {
  auto: '固定しない',
  firstFixed: '一軍固定希望',
  farmFixed: '二軍固定希望',
};

/** この表示のsession/revisionで指示を作り、再開後の別表示へ付け替えない。 */
export function TradePlayPanel({
  active,
  view,
  disabled,
  onDraftChange,
  onSend,
}: {
  active: TradeWorkerActive;
  view: TradePlayView;
  disabled: boolean;
  onDraftChange: (value: boolean) => void;
  onSend: (action: TradeWorkerAction, success: string) => Promise<void>;
}) {
  const [bench, setBench] = useState(() => ({
    away: [...(view.matchSetup?.sides.away.savedBenchIds ?? [])],
    home: [...(view.matchSetup?.sides.home.savedBenchIds ?? [])],
  }));
  const [changeMode, setChangeMode] = useState<RosterChangeMode>(view.rosterPolicy.changeMode);
  const [draftPreferences, setDraftPreferences] = useState(() =>
    Object.fromEntries(view.preferences.map((p) => [p.playerId, p.preference])),
  );
  const [selectedPlayer, setSelectedPlayer] = useState(view.players[0]?.playerId ?? '');
  const dirty =
    changeMode !== view.rosterPolicy.changeMode ||
    view.preferences.some((p) => draftPreferences[p.playerId] !== p.preference);
  useEffect(() => {
    onDraftChange(dirty);
    return () => onDraftChange(false);
  }, [dirty, onDraftChange]);
  function command(value: TradeWorkerCommand, success: string) {
    if (!disabled)
      void onSend(
        { kind: 'candidateCommand', sessionId: active.sessionId, command: value },
        success,
      );
  }
  function commandContext() {
    // 操作IDは通信メタデータ。ゲーム乱数や判定には使用しない。
    return {
      localWorldId: view.localWorldId,
      worldId: view.worldId,
      expectedStateRevision: view.stateRevision,
      commandId: crypto.randomUUID(),
    };
  }
  const next = view.games.find((g) => g.gameId === view.nextGameId);
  const setup = view.matchSetup;
  const name = (squadId: string) =>
    view.teams.find((team) => team.squadId === squadId)?.name ?? squadId;
  const benchWithinLimits =
    setup &&
    (['away', 'home'] as const).every((side) => {
      const team = setup.sides[side];
      return (
        bench[side].length > 0 &&
        bench[side].length <= team.benchLimit &&
        (team.foreignBenchLimit === null ||
          team.players.filter(
            (p) => bench[side].includes(p.playerId) && p.foreignBaseStatus === 'subject',
          ).length <= team.foreignBenchLimit)
      );
    });
  const selected = view.players.find((p) => p.playerId === selectedPlayer);
  return (
    <>
      <section className="trade-play-section" aria-label="候補の進行">
        <div className="trade-play-heading">
          <h2>{view.clubs.find((c) => c.clubId === view.controlledClubId)?.name}</h2>
          <strong>{view.currentDate}</strong>
        </div>
        <p>
          {phaseLabels[view.phase]} ／ 当日 {view.dayPlan.cursor} / {view.dayPlan.gameIds.length}
          試合確定 ／ 最終日次確定 {view.lastCompletedDate ?? 'なし'}
        </p>
        {dirty && (
          <p role="status">
            固定希望に未送信の変更があります。「反映して自動保存」か「下書きを戻す」を選んでから試合・日付を進めてください。
          </p>
        )}
        {next && (
          <div className="trade-play-match">
            <strong>
              {next.display?.teams.away ?? name(next.awaySquadId)}
              <small>VISITOR</small>
            </strong>
            <MatchScore
              away={next.score?.away ?? null}
              home={next.score?.home ?? null}
              awayName={name(next.awaySquadId)}
              homeName={name(next.homeSquadId)}
            />
            <strong>
              {next.display?.teams.home ?? name(next.homeSquadId)}
              <small>HOME</small>
            </strong>
          </div>
        )}
        {next?.situation && (
          <p className="trade-play-count">
            {next.situation.inning}回{next.situation.half === 'top' ? '表' : '裏'} ／{' '}
            {next.situation.outs}アウト ／ B {next.situation.count.balls} S{' '}
            {next.situation.count.strikes} ／ 走者{' '}
            {next.situation.occupiedBases
              .map((occupied, i) => (occupied ? `${i + 1}塁` : null))
              .filter(Boolean)
              .join('・') || 'なし'}{' '}
            ／ 総投球 {next.totalPitches}球
          </p>
        )}
        {setup && (
          <>
            <h3>両チームのベンチを選択</h3>
            <div className="trade-bench-grid">
              {(['away', 'home'] as const).map((side) => (
                <TradeBenchSelection
                  key={side}
                  team={setup.sides[side]}
                  selected={bench[side]}
                  disabled={disabled || !view.capabilities.canBeginGame}
                  onChange={(ids) => setBench((value) => ({ ...value, [side]: ids }))}
                />
              ))}
            </div>
            <button
              className="primary"
              disabled={disabled || dirty || !view.capabilities.canBeginGame || !benchWithinLimits}
              onClick={() =>
                command(
                  {
                    ...commandContext(),
                    kind: 'beginTradeGame',
                    gameId: setup.gameId,
                    benchIds: bench,
                  },
                  '選択したベンチで試合を開始しました。まだ保存していません。',
                )
              }
            >
              このベンチで試合開始
            </button>
            <p className="muted">
              必要な打順・投手と登録条件は開始時にWorkerが再検査します。自動ベンチ選出は工事中です。
            </p>
          </>
        )}
        {view.phase === 'playing' && next && (
          <div className="trade-play-actions">
            {[1, 25].map((eventCount) => (
              <button
                key={eventCount}
                className={eventCount === 25 ? 'primary' : 'secondary'}
                disabled={
                  disabled ||
                  dirty ||
                  !view.capabilities.canAdvanceGame ||
                  next.nextEventSeq === null
                }
                onClick={() =>
                  command(
                    {
                      ...commandContext(),
                      kind: 'advanceTradeGame',
                      gameId: next.gameId,
                      eventCount,
                      expectedNextEventSeq: next.nextEventSeq!,
                    },
                    '試合を進めました。試合途中は手動保存してください。',
                  )
                }
              >
                {eventCount}イベント進める
              </button>
            ))}
          </div>
        )}
        {!!view.saveState.pendingCommands &&
          view.saveState.pendingCommands >= view.saveState.commandLimit && (
            <p role="status">未保存指示の上限です。手動保存すると試合を続行できます。</p>
          )}
        {view.phase === 'dayComplete' && (
          <button
            className="primary"
            disabled={disabled || dirty || !view.capabilities.canCompleteDay}
            onClick={() =>
              command(
                {
                  ...commandContext(),
                  kind: 'completeTradeDayWithRoster',
                  expectedDate: view.currentDate,
                },
                '当日を確定して自動保存しました。翌日を表示しています。',
              )
            }
          >
            この日を確定して翌日へ（自動保存）
          </button>
        )}
        {view.phase === 'aborted' && (
          <p role="alert">試合が異常停止しました。正常な結果として日次確定できません。</p>
        )}
        {view.phase === 'seasonComplete' && (
          <p>一二軍の対象日程が終了しました。ポストシーズン・正式表彰の接続は工事中です。</p>
        )}
        <details>
          <summary>当日の全試合</summary>
          <div className="table-scroll">
            <table aria-label="候補の当日試合">
              <thead>
                <tr>
                  <th>ビジター</th>
                  <th>スコア</th>
                  <th>ホーム</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {view.games
                  .filter((g) => g.date === view.currentDate)
                  .map((game) => (
                    <tr key={game.gameId}>
                      <th scope="row">{game.display?.teams.away ?? name(game.awaySquadId)}</th>
                      <td>{game.score ? `${game.score.away} - ${game.score.home}` : '—'}</td>
                      <td>{game.display?.teams.home ?? name(game.homeSquadId)}</td>
                      <td>{statusLabels[game.status]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="trade-play-section" aria-labelledby="candidate-roster-title">
        <h2 id="candidate-roster-title">現在所属の選手と固定希望</h2>
        <label>
          登録入替の方針
          <select
            disabled={disabled || !view.capabilities.canEditRoster}
            value={changeMode}
            onChange={(event) => setChangeMode(event.target.value as RosterChangeMode)}
          >
            <option value="manual">手動（希望を記録）</option>
            <option value="auto">自動（固定希望の差分を審査）</option>
          </select>
        </label>
        <p className="muted">
          当日の全試合開始前に変更できます。自動でも編成不足や再登録待ちは保留します。直接の登録・打順変更画面は工事中です。
        </p>
        <div className="table-scroll">
          <table aria-label="候補の所属選手と固定希望">
            <thead>
              <tr>
                <th>選手</th>
                <th>現在登録</th>
                <th>一軍再登録可能日</th>
                <th>体力</th>
                <th>疲労</th>
                <th>固定希望（下書き）</th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((player) => (
                <tr key={player.playerId}>
                  <th scope="row">
                    <button
                      className="secondary"
                      aria-pressed={selectedPlayer === player.playerId}
                      onClick={() => setSelectedPlayer(player.playerId)}
                    >
                      {player.name}
                    </button>
                  </th>
                  <td>{player.category === 'first' ? '一軍' : '二軍'}</td>
                  <td>{player.nextFirstEligibleOn ?? '待機なし'}</td>
                  <td>
                    <meter
                      min={0}
                      max={100000}
                      value={player.energyMilli}
                      aria-label={`${player.name}の体力`}
                    />{' '}
                    {(player.energyMilli / 1000).toFixed(1)}
                  </td>
                  <td>
                    <meter
                      min={0}
                      max={100000}
                      value={player.fatigueMilli}
                      aria-label={`${player.name}の疲労`}
                    />{' '}
                    {(player.fatigueMilli / 1000).toFixed(1)}
                  </td>
                  <td>
                    <select
                      aria-label={`${player.name}の固定希望`}
                      disabled={disabled || !view.capabilities.canEditRoster}
                      value={draftPreferences[player.playerId]}
                      onChange={(event) =>
                        setDraftPreferences((value) => ({
                          ...value,
                          [player.playerId]: event.target.value as RosterPreference,
                        }))
                      }
                    >
                      {Object.entries(preferences).map(([key, text]) => (
                        <option key={key} value={key}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="trade-play-actions">
          <button
            className="primary"
            disabled={disabled || !dirty || !view.capabilities.canEditRoster}
            onClick={() =>
              command(
                {
                  ...commandContext(),
                  kind: 'setTradeRosterPolicy',
                  clubId: view.controlledClubId,
                  expectedDate: view.currentDate,
                  changeMode,
                  preferences: view.players.map((p) => ({
                    playerId: p.playerId,
                    preference: draftPreferences[p.playerId]!,
                  })),
                },
                '固定希望を反映して自動保存しました。実際の登録と最終評価を確認してください。',
              )
            }
          >
            固定希望を反映して自動保存
          </button>
          <button
            className="secondary"
            disabled={disabled || !dirty}
            onClick={() => {
              setChangeMode(view.rosterPolicy.changeMode);
              setDraftPreferences(
                Object.fromEntries(view.preferences.map((p) => [p.playerId, p.preference])),
              );
            }}
          >
            下書きを戻す
          </button>
        </div>
        {view.lastReconciliation && (
          <details open={view.lastReconciliation.report.status === 'pending'}>
            <summary>
              固定希望の最終評価：
              {view.lastReconciliation.report.status === 'pending'
                ? '保留'
                : view.lastReconciliation.report.status === 'applied'
                  ? '適用'
                  : '差分なし'}
            </summary>
            <p>
              {view.lastReconciliation.at.date}（状態版 {view.lastReconciliation.stateRevision}
              ）時点の評価です。
            </p>
            <ul>
              {view.lastReconciliation.report.issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          </details>
        )}
        {selected && (
          <details key={selected.playerId} open>
            <summary>{selected.name}の現在能力・状態</summary>
            <p>
              調子 {(selected.conditionMilli / 1000).toFixed(1)} / 100 ／{' '}
              {selected.throwingHand === 'R' ? '右' : '左'}投・
              {selected.battingHand === 'R' ? '右' : selected.battingHand === 'L' ? '左' : '両'}打
            </p>
            <dl className="trade-play-abilities">
              {selected.abilities.map((ability) => (
                <div key={ability.key}>
                  <dt>{ability.label}</dt>
                  <dd>
                    <AbilityRating
                      valueMilli={ability.valueMilli}
                      label={`${selected.name}の${ability.label}`}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>
    </>
  );
}
