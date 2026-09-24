import { useEffect, useState } from 'react';
import type { WorldAction, WorldView } from '../world/controller.ts';
import type { ClubManagement, IdealLineup, PitcherUsagePlan } from '../world/types.ts';
import type { Team } from '../game/types.ts';

const positions: Team['lineup'][number]['position'][] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
];

/** 編集中の下書きだけをUIに保持し、確定した起用設定はWorkerから取得する。 */
export function ClubEditor({
  view,
  management,
  disabled,
  send,
}: {
  view: WorldView;
  management: ClubManagement;
  disabled: boolean;
  send: (action: WorldAction) => void;
}) {
  const squadId = management.controlledSquadId;
  const squad = view.definitions.squads.find((squad) => squad.squadId === squadId)!;
  const batterIds = [
    ...squad.team.lineup.map((slot) => slot.playerId),
    ...(squad.reserveBatterIds ?? []),
  ];
  const currentLineup = management.idealLineups[squadId]!;
  const currentPlan = management.pitcherUsagePlans[squadId]!;
  const [batters, setBatters] = useState(() => structuredClone(currentLineup.battingOrder));
  const [rotation, setRotation] = useState(() =>
    currentPlan.rotationSlots.map((slot) => slot.playerId),
  );
  const [relievers, setRelievers] = useState(() =>
    currentPlan.reliefRoles.map((role) => role.playerId),
  );
  const [nextSlot, setNextSlot] = useState(currentPlan.nextSlotNo);
  const today = view.games.find(
    (game) =>
      game.date === view.currentDate && [game.awaySquadId, game.homeSquadId].includes(squadId),
  );
  const [starter, setStarter] = useState(
    today ? (management.starterOverrides[today.gameId] ?? '') : '',
  );
  const policyKey = JSON.stringify([currentLineup, currentPlan, view.currentDate]);
  const starterKey = JSON.stringify([
    today?.gameId,
    today ? management.starterOverrides[today.gameId] : null,
  ]);

  useEffect(() => {
    setBatters(structuredClone(currentLineup.battingOrder));
    setRotation(currentPlan.rotationSlots.map((slot) => slot.playerId));
    setRelievers(currentPlan.reliefRoles.map((role) => role.playerId));
    setNextSlot(currentPlan.nextSlotNo);
  }, [policyKey]);

  useEffect(() => {
    setStarter(today ? (management.starterOverrides[today.gameId] ?? '') : '');
  }, [starterKey]);

  const locked = disabled || !view.canEditManagement;
  const playerName = (id: string) => {
    const player = squad.players.find((player) => player.playerId === id)!;
    return player.familyName + ' ' + player.givenName;
  };
  const invalid =
    new Set(batters.map((slot) => slot.battingRole)).size !== 9 ||
    new Set(batters.map((slot) => slot.playerId)).size !== 9 ||
    new Set(rotation).size !== rotation.length;
  const plannedStarter = currentPlan.rotationSlots[currentPlan.nextSlotNo - 1]!.playerId;
  const actualStarter = today?.startingPitchers
    ? today.startingPitchers[today.awaySquadId === squadId ? 'away' : 'home']
    : today
      ? (management.starterOverrides[today.gameId] ?? plannedStarter)
      : null;

  function selectBatter(index: number, playerId: string) {
    const next = structuredClone(batters);
    const prior = next.findIndex((slot) => slot.playerId === playerId);
    if (prior !== -1) next[prior]!.playerId = next[index]!.playerId;
    next[index]!.playerId = playerId;
    setBatters(next);
  }

  function reorder(index: number, direction: number) {
    const next = structuredClone(batters);
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    setBatters(next);
  }

  function updateRotation(next: string[]) {
    setRotation(next);
    // 救援の既存順を保ち、先発枠から外れた投手を末尾へ追加する。
    setRelievers(
      [...new Set([...relievers, ...squad.team.pitcherIds])].filter((id) => !next.includes(id)),
    );
    if (nextSlot > next.length) setNextSlot(1);
  }

  function draftLineup(): IdealLineup {
    const lineup: IdealLineup = {
      dhEnabled: true,
      battingOrder: batters.map((slot, index) => ({ ...slot, slotNo: index + 1 })),
      defense: [
        ...batters
          .filter((slot) => slot.battingRole !== 'DH')
          .map((slot) => ({
            positionCode: slot.battingRole as Exclude<typeof slot.battingRole, 'DH'>,
            playerId: slot.playerId,
          })),
        { positionCode: 'P', playerId: null },
      ],
    };
    return lineup;
  }

  function savePlan() {
    const lineup = draftLineup();
    const pitchers: PitcherUsagePlan = {
      rotationSlots: rotation.map((playerId, index) => ({ slotNo: index + 1, playerId })),
      nextSlotNo: nextSlot,
      reliefRoles: relievers.map((playerId, index) => ({
        playerId,
        role: 'relief',
        priority: index + 1,
      })),
    };
    send({ kind: 'setClubPlan', squadId, lineup, pitchers });
  }

  return (
    <section className="panel" aria-label="球団運営">
      <h2>担当球団：{squad.team.name}</h2>
      <p>
        次のローテーション：{currentPlan.nextSlotNo}枠目 ・ {playerName(plannedStarter)}
      </p>
      {today && (
        <p data-testid="today-starter">
          今日の先発：{playerName(actualStarter!)}
          {today.startingPitchers ? '（試合開始時に確定済み）' : ''}
        </p>
      )}
      {today && view.gameLineups && (
        <details>
          <summary>今日のオーダーを確認</summary>
          <p>
            {today.lineups
              ? '試合開始時に確定した配置'
              : view.gameLineups[today.gameId]
                ? '当日指定を使用'
                : '理想オーダーを使用'}
          </p>
          <ol>
            {(today.lineups
              ? today.lineups[today.awaySquadId === squadId ? 'away' : 'home']
              : (view.gameLineups[today.gameId] ?? currentLineup).battingOrder.map((slot) => ({
                  playerId: slot.playerId,
                  position: slot.battingRole,
                }))
            ).map((slot) => (
              <li key={slot.playerId}>
                {playerName(slot.playerId)} / {slot.position}
              </li>
            ))}
          </ol>
        </details>
      )}
      {!view.canEditManagement && (
        <p className="hint">
          当日の試合開始後は編成を変更できません。翌日に進めると再び編集できます。
        </p>
      )}
      <details>
        <summary>打順・守備・投手起用を編集</summary>
        <p className="hint">
          確定すると自動保存します。当日の最初の試合を始める前に設定してください。
        </p>
        <h3>理想オーダー</h3>
        {view.gameLineups && (
          <p className="hint">
            野手候補{batterIds.length}人から9人を選びます。下書きで外れている選手：
            {batterIds
              .filter((id) => !batters.some((slot) => slot.playerId === id))
              .map(playerName)
              .join('、') || 'なし'}
            。 この入替は一二軍の登録変更ではありません。
          </p>
        )}
        <div className="world-table">
          <table>
            <thead>
              <tr>
                <th>打順</th>
                <th>選手</th>
                <th>守備位置</th>
                <th>順序</th>
              </tr>
            </thead>
            <tbody>
              {batters.map((slot, index) => (
                <tr key={slot.playerId}>
                  <th>{index + 1}番</th>
                  <td>
                    {view.gameLineups ? (
                      <select
                        className="roster-player-select"
                        aria-label={index + 1 + '番の選手'}
                        value={slot.playerId}
                        disabled={locked}
                        onChange={(event) => selectBatter(index, event.target.value)}
                      >
                        {batterIds.map((id) => (
                          <option key={id} value={id}>
                            {playerName(id)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      playerName(slot.playerId)
                    )}
                  </td>
                  <td>
                    <select
                      aria-label={`${index + 1}番の守備位置`}
                      value={slot.battingRole}
                      disabled={locked}
                      onChange={(event) =>
                        setBatters(
                          batters.map((entry, at) =>
                            at === index
                              ? {
                                  ...entry,
                                  battingRole: event.target.value as typeof slot.battingRole,
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      {positions.map((position) => (
                        <option key={position} value={position}>
                          {position}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="order-buttons">
                    <button
                      aria-label={`${index + 1}番を上へ`}
                      disabled={locked || index === 0}
                      onClick={() => reorder(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`${index + 1}番を下へ`}
                      disabled={locked || index === 8}
                      onClick={() => reorder(index, 1)}
                    >
                      ↓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.gameLineups && today && (
          <div className="world-controls">
            <button
              disabled={locked || invalid}
              onClick={() =>
                send({
                  kind: 'setGameLineup',
                  squadId,
                  gameId: today.gameId,
                  lineup: draftLineup(),
                })
              }
            >
              この打順を今日だけ指定して保存
            </button>
            <button
              className="secondary"
              disabled={locked || !view.gameLineups[today.gameId]}
              onClick={() =>
                send({ kind: 'setGameLineup', squadId, gameId: today.gameId, lineup: null })
              }
            >
              今日の指定を解除
            </button>
            <p className="hint">
              今日だけの指定は理想オーダーを変更しません。別の日には理想オーダーへ戻ります。
              「編成を確定して自動保存」は理想オーダーを更新しますが、今日の指定は解除しません。
            </p>
          </div>
        )}
        <h3>先発ローテーション</h3>
        <label>
          使用する先発枠{' '}
          <select
            value={rotation.length}
            disabled={locked}
            onChange={(event) => {
              const length = Number(event.target.value);
              const next = [...rotation];
              while (next.length < length)
                next.push(squad.team.pitcherIds.find((id) => !next.includes(id))!);
              updateRotation(next.slice(0, length));
            }}
          >
            {Array.from({ length: Math.min(6, squad.team.pitcherIds.length) }, (_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}人
              </option>
            ))}
          </select>
        </label>
        <div className="rotation-grid">
          {rotation.map((playerId, index) => (
            <label key={index}>
              {index + 1}枠目の投手{' '}
              <select
                value={playerId}
                disabled={locked}
                onChange={(event) => {
                  const next = [...rotation];
                  const other = next.indexOf(event.target.value);
                  if (other !== -1) next[other] = playerId;
                  next[index] = event.target.value;
                  updateRotation(next);
                }}
              >
                {squad.team.pitcherIds.map((id) => (
                  <option key={id} value={id}>
                    {playerName(id)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          次に使う先発枠{' '}
          <select
            value={nextSlot}
            disabled={locked}
            onChange={(event) => setNextSlot(Number(event.target.value))}
          >
            {rotation.map((_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}枠目
              </option>
            ))}
          </select>
        </label>
        <h3>救援の優先順</h3>
        {relievers.length === 0 && <p>救援投手の指定なし。先発が最後まで投げる試作規則です。</p>}
        {relievers.map((playerId, index) => (
          <label key={index}>
            救援{index + 1}番目{' '}
            <select
              value={playerId}
              disabled={locked}
              onChange={(event) => {
                const next = [...relievers];
                const other = next.indexOf(event.target.value);
                [next[index], next[other]] = [next[other]!, next[index]!];
                setRelievers(next);
              }}
            >
              {relievers.map((id) => (
                <option key={id} value={id}>
                  {playerName(id)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {invalid && (
          <p className="error" role="alert">
            守備位置・先発投手の重複を解消してください。
          </p>
        )}
        <div className="world-controls">
          <button disabled={locked || invalid} onClick={savePlan}>
            編成を確定して自動保存
          </button>
        </div>
        <p className="hint">
          登板しないローテーション投手はベンチ外です。疲労・登板間隔による補正や自動休養はまだ計算しません。
        </p>

        <h3>当日だけの先発変更</h3>
        {today ? (
          <>
            <label>
              今日の先発指定{' '}
              <select
                value={starter}
                disabled={locked}
                onChange={(event) => setStarter(event.target.value)}
              >
                <option value="">ローテーションに従う</option>
                {squad.team.pitcherIds.map((id) => (
                  <option key={id} value={id}>
                    {playerName(id)}
                  </option>
                ))}
              </select>
            </label>
            <div className="world-controls">
              <button
                disabled={locked}
                onClick={() =>
                  send({
                    kind: 'setGameStarter',
                    squadId,
                    gameId: today.gameId,
                    playerId: starter || null,
                  })
                }
              >
                当日先発を確定して自動保存
              </button>
            </div>
            <p className="hint">
              ローテーションの割当は変更しません。試合が正常終了すると、通常どおり次の枠へ進みます。
            </p>
          </>
        ) : (
          <p>今日は担当球団の試合がありません。</p>
        )}
      </details>
    </section>
  );
}
