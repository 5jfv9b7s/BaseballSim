import { useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { FormationDraft } from '../world/formation-draft.ts';
import type { IdealLineup } from '../world/types.ts';
import './formation.css';

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;

export function FormationEditor({
  view,
  draft,
  changed,
  locked,
  onChange,
  onReset,
  onSelectPlayer,
}: {
  view: WorldView;
  draft: FormationDraft;
  changed: boolean;
  locked: boolean;
  onChange: (draft: FormationDraft) => void;
  onReset: () => void;
  onSelectPlayer: (id: string) => void;
}) {
  const [tab, setTab] = useState<'batters' | 'pitchers' | 'policy'>('batters');
  const [selected, setSelected] = useState('');
  const squad = view.definitions.squads.find((s) => s.squadId === draft.squadId)!;
  const name = (id: string) => {
    const p = squad.players.find((p) => p.playerId === id)!;
    return p.familyName + ' ' + p.givenName;
  };
  const first = draft.firstPlayerIds ?? squad.players.map((p) => p.playerId);
  const pitcherIds = squad.team.pitcherIds;
  const batterIds = [
    ...squad.team.lineup.map((s) => s.playerId),
    ...(squad.reserveBatterIds ?? []),
  ];
  const order = draft.lineup.battingOrder;
  const rotation = draft.pitchers.rotationSlots.map((p) => p.playerId);
  const relief = draft.pitchers.reliefRoles.map((p) => p.playerId);
  const candidateIds = tab === 'pitchers' ? pitcherIds : batterIds;
  const infoId = selected || order[0]!.playerId;
  const info = squad.players.find((p) => p.playerId === infoId)!;
  const status = view.playerStatuses.find((p) => p.playerId === infoId);
  const rules = view.definitions.registrationRules;
  const registrationLocked =
    locked || !draft.firstPlayerIds || view.rosterPolicy?.policy.changeMode === 'auto';

  function changeOrder(rows: IdealLineup['battingOrder']) {
    onChange({
      ...draft,
      lineup: {
        dhEnabled: true,
        battingOrder: rows.map((row, index) => ({ ...row, slotNo: index + 1 })),
        defense: [
          ...rows
            .filter((r) => r.battingRole !== 'DH')
            .map((r) => ({
              positionCode: r.battingRole as Exclude<typeof r.battingRole, 'DH'>,
              playerId: r.playerId,
            })),
          { positionCode: 'P', playerId: null },
        ],
      },
    });
  }
  function putBatter(index: number, id: string) {
    if (locked || !batterIds.includes(id)) return;
    setSelected(id);
    const rows = structuredClone(order);
    const prior = rows.findIndex((r) => r.playerId === id);
    // スタメン同士は守備ごと打順を交換。控えからは枠の守備を引き継ぐ。
    if (prior >= 0) [rows[index], rows[prior]] = [rows[prior]!, rows[index]!];
    else rows[index]!.playerId = id;
    changeOrder(rows);
  }
  function moveRegistration(id: string, toFirst: boolean) {
    if (registrationLocked) return;
    onChange({
      ...draft,
      firstPlayerIds: toFirst ? [...new Set([...first, id])] : first.filter((p) => p !== id),
    });
  }
  function setPitchers(starters: string[], relievers: string[]) {
    onChange({
      ...draft,
      pitchers: {
        rotationSlots: starters.map((playerId, index) => ({ playerId, slotNo: index + 1 })),
        reliefRoles: relievers.map((playerId, index) => ({
          playerId,
          role: 'relief',
          priority: index + 1,
        })),
        nextSlotNo: Math.min(draft.pitchers.nextSlotNo, Math.max(1, starters.length)),
      },
    });
  }
  function pitcherRole(id: string, starter: boolean) {
    if (locked) return;
    setPitchers(
      starter ? [...rotation.filter((p) => p !== id), id] : rotation.filter((p) => p !== id),
      starter ? relief.filter((p) => p !== id) : [...relief.filter((p) => p !== id), id],
    );
  }
  function pitcherOrder(ids: string[], index: number, direction: number, starter: boolean) {
    const next = [...ids];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    setPitchers(starter ? next : rotation, starter ? relief : next);
  }
  function playerButton(id: string) {
    return (
      <button
        className="player-link"
        aria-pressed={infoId === id}
        draggable={!locked}
        onDragStart={(e) => {
          setSelected(id);
          e.dataTransfer.setData('text/plain', id);
        }}
        onClick={() => {
          setSelected(id);
          // 小画面では遠い情報列へのスクロールを不要にする。
          if (window.matchMedia('(max-width: 600px)').matches) onSelectPlayer(id);
        }}
      >
        {name(id)}
      </button>
    );
  }
  function registrationButton(id: string) {
    const row = view.registration?.registrations.find((r) => r.playerId === id && r.until === null);
    const waiting =
      !first.includes(id) &&
      row?.category === 'farm' &&
      !!row.nextFirstEligibleOn &&
      row.nextFirstEligibleOn > view.currentDate;
    return (
      <>
        <button
          disabled={registrationLocked || waiting}
          aria-label={`${name(id)}を${first.includes(id) ? '二軍' : '一軍'}へ`}
          onClick={() => moveRegistration(id, !first.includes(id))}
        >
          {first.includes(id) ? '二軍へ' : '一軍へ'}
        </button>
        {waiting && <small>再登録可能：{row.nextFirstEligibleOn}</small>}
      </>
    );
  }
  function group(title: string, ids: string[], toFirst: boolean) {
    return (
      <section
        className="formation-column"
        aria-label={title}
        onDragOver={(e) => {
          if (!registrationLocked) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/plain');
          if (candidateIds.includes(id)) moveRegistration(id, toFirst);
        }}
      >
        <h4>
          {title}（{ids.length}人）
        </h4>
        {ids.map((id) => (
          <div className="formation-player" key={id}>
            {playerButton(id)}
            {registrationButton(id)}
          </div>
        ))}
        {ids.length === 0 && <p>該当する選手はいません。</p>}
      </section>
    );
  }
  function pitcherGroup(title: string, ids: string[], starter: boolean) {
    return (
      <section className="formation-column" aria-label={title}>
        <h4>{title}</h4>
        {ids.map((id, index) => (
          <div className="formation-player" key={id}>
            <span>
              {index + 1}. {playerButton(id)}{' '}
              <small>{first.includes(id) ? '一軍' : '二軍・理想案のみ'}</small>
            </span>
            <div className="formation-actions">
              <button
                aria-label={`${name(id)}の優先順を上げる`}
                disabled={locked || index === 0}
                onClick={() => pitcherOrder(ids, index, -1, starter)}
              >
                ↑
              </button>
              <button
                aria-label={`${name(id)}の優先順を下げる`}
                disabled={locked || index === ids.length - 1}
                onClick={() => pitcherOrder(ids, index, 1, starter)}
              >
                ↓
              </button>
              <button disabled={locked} onClick={() => pitcherRole(id, !starter)}>
                {starter ? '救援へ' : '先発へ'}
              </button>
              {registrationButton(id)}
            </div>
          </div>
        ))}
      </section>
    );
  }
  return (
    <section className="panel formation-editor" aria-label="編成の編集">
      <h3>{squad.team.name}の編成</h3>
      <p role="status">
        {changed ? '変更中 — 編成を離れると検証して自動保存します。' : '変更はありません。'}
      </p>
      <p>
        {view.currentDate}の登録案：一軍 {first.length}/{rules?.firstLimit ?? '—'}人 ／ 二軍{' '}
        {squad.players.length - first.length}人
      </p>
      <p>
        当日の確定状態からのベンチ見込み：{view.registrationPreview?.roster.playerIds.length ?? '—'}
        /{rules?.benchLimit ?? '—'}人（編集案の反映前）
      </p>
      <div className="world-controls">
        <button disabled={locked || !changed} onClick={onReset}>
          変更を戻す
        </button>
        <button aria-pressed={tab === 'policy'} onClick={() => setTab('policy')}>
          起用方針
        </button>
      </div>
      <nav className="main-subnav" aria-label="編成の項目">
        <button aria-pressed={tab === 'batters'} onClick={() => setTab('batters')}>
          野手オーダー
        </button>
        <button aria-pressed={tab === 'pitchers'} onClick={() => setTab('pitchers')}>
          投手オーダー
        </button>
      </nav>
      {locked && <p className="hint">現在は閲覧のみです。当日の全試合を始める前に編集できます。</p>}
      <p className="hint">
        タブの切替や選手詳細の閲覧では確定しません。再読込で未確定の編集は失われます。保存できなければこの画面で修正・取消できます。
      </p>
      {tab === 'policy' ? (
        <>
          <h4>起用方針の本画面編集は工事中</h4>
          <p>
            一軍・二軍の管理：{view.rosterPolicy?.policy.changeMode === 'auto' ? '自動' : '手動'}
            。現在の休養・救援方針を引き続き使用します。
          </p>
          <p>
            固定希望・休養条件・条件別救援の編集は開発用画面で利用できます。編成を離れてから開いてください。
          </p>
        </>
      ) : (
        <>
          {view.rosterPolicy?.policy.changeMode === 'auto' && (
            <p>
              自動管理中は直接の一軍・二軍移動を行えません。管理方針は開発用画面で変更できます。
            </p>
          )}
          <div className="formation-columns">
            {tab === 'batters' ? (
              <>
                <section className="formation-column" aria-label="理想オーダー">
                  <h4>一軍の理想オーダー</h4>
                  {order.map((row, index) => (
                    <div
                      className="formation-slot"
                      key={row.slotNo}
                      onDragOver={(e) => {
                        if (!locked) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (locked) return;
                        const position = e.dataTransfer.getData('application/x-baseball-position');
                        if (position !== '') {
                          const from = Number(position);
                          if (!Number.isInteger(from) || from < 0 || from > 8) return;
                          const rows = structuredClone(order);
                          [rows[index]!.battingRole, rows[from]!.battingRole] = [
                            rows[from]!.battingRole,
                            rows[index]!.battingRole,
                          ];
                          changeOrder(rows);
                        } else putBatter(index, e.dataTransfer.getData('text/plain'));
                      }}
                    >
                      <span>
                        {index + 1}番 {playerButton(row.playerId)}{' '}
                        {!first.includes(row.playerId) && <small>二軍の理想枠・当日は代役</small>}
                      </span>
                      <select
                        aria-label={`${index + 1}番の選手`}
                        value={row.playerId}
                        disabled={locked}
                        onChange={(e) => putBatter(index, e.target.value)}
                      >
                        {batterIds.map((id) => (
                          <option key={id} value={id}>
                            {name(id)}
                            {first.includes(id) ? '' : '（二軍）'}
                          </option>
                        ))}
                      </select>
                      <div className="formation-actions">
                        <select
                          aria-label={`${index + 1}番の守備位置`}
                          value={row.battingRole}
                          disabled={locked}
                          onChange={(e) => {
                            const rows = structuredClone(order);
                            const other = rows.findIndex((r) => r.battingRole === e.target.value);
                            [rows[index]!.battingRole, rows[other]!.battingRole] = [
                              rows[other]!.battingRole,
                              rows[index]!.battingRole,
                            ];
                            changeOrder(rows);
                          }}
                        >
                          {POSITIONS.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                        <span
                          draggable={!locked}
                          onDragStart={(e) =>
                            e.dataTransfer.setData('application/x-baseball-position', String(index))
                          }
                          title="守備位置をドラッグして交換"
                        >
                          {row.battingRole} ↔
                        </span>
                        <button
                          disabled={locked || index === 0}
                          aria-label={`${index + 1}番を上へ`}
                          onClick={() => putBatter(index, order[index - 1]!.playerId)}
                        >
                          ↑
                        </button>
                        <button
                          disabled={locked || index === 8}
                          aria-label={`${index + 1}番を下へ`}
                          onClick={() => putBatter(index, order[index + 1]!.playerId)}
                        >
                          ↓
                        </button>
                      </div>
                      {registrationButton(row.playerId)}
                    </div>
                  ))}
                </section>
                {group(
                  '一軍控え',
                  batterIds.filter(
                    (id) => first.includes(id) && !order.some((r) => r.playerId === id),
                  ),
                  true,
                )}
              </>
            ) : (
              <>
                {pitcherGroup('先発ローテーション', rotation, true)}
                {pitcherGroup('通常救援の優先順', relief, false)}
              </>
            )}
            {group(
              tab === 'batters' ? '二軍野手' : '二軍投手',
              candidateIds.filter((id) => !first.includes(id)),
              false,
            )}
            <aside className="formation-column formation-info" aria-label="選択選手情報">
              <h4>{name(infoId)}</h4>
              <p>
                {first.includes(infoId) ? '一軍案' : '二軍案'} ／{' '}
                {info.throwingHand === 'R' ? '右' : '左'}投
                {info.battingHand === 'R' ? '右' : info.battingHand === 'L' ? '左' : '両'}打
              </p>
              <p>
                調子：{status?.condition ?? '記録なし'} ／ 疲労：
                {status?.fatigueMilli == null
                  ? '記録なし'
                  : (status.fatigueMilli / 1000).toFixed(1)}
              </p>
              <p>
                現在のミート：対右 {info.batting.contactVsRight.valueMilli / 1000} ／ 対左{' '}
                {info.batting.contactVsLeft.valueMilli / 1000}
              </p>
              <p>
                現在のパワー：対右 {info.powerVsRight.valueMilli / 1000} ／ 対左{' '}
                {info.powerVsLeft.valueMilli / 1000}
              </p>
              <button onClick={() => onSelectPlayer(infoId)}>選手詳細を開く</button>
              <p className="hint">詳細の登録は確定状態です。怪我・適性・成長履歴は工事中です。</p>
            </aside>
          </div>
          {tab === 'pitchers' && (
            <label>
              次の先発枠
              <select
                aria-label="次の先発枠"
                value={draft.pitchers.nextSlotNo}
                disabled={locked}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    pitchers: { ...draft.pitchers, nextSlotNo: Number(e.target.value) },
                  })
                }
              >
                {rotation.map((id, index) => (
                  <option key={id} value={index + 1}>
                    {index + 1}：{name(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="hint">
            理想枠は二軍の選手も保持し、当日は既存の代役選定を使います。先発は1〜6人、全投手を先発か通常救援へ割り当てます。役割別の配置と登板履歴表示は工事中です。
          </p>
        </>
      )}
    </section>
  );
}
