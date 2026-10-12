import { formationDefaults } from '../../config/formation.ts';
import { useState, type DragEvent } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { FormationDraft } from '../world/formation-draft.ts';
import type { IdealLineup } from '../world/types.ts';
import type { RosterPreference } from '../world/roster-policy-types.ts';
import {
  formationReliefGroups,
  formationReliefGroup,
  formationReliefLabels,
  placeFormationPitcher,
  type FormationReliefGroup,
} from '../world/formation-pitchers.ts';
import { FormationPolicy } from './FormationPolicy.tsx';
import { PlayerDetails } from './PlayerDetails.tsx';
import './formation.css';

const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
const PLAYER = 'text/plain';
const POSITION = 'application/x-baseball-position';
const ROLE = 'application/x-baseball-relief-group';

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
  const [showControls, setShowControls] = useState(false);
  const [dragged, setDragged] = useState<{ playerId?: string; position?: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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
  const rotation = draft.pitchers.rotationSlots
    .map((p) => p.playerId)
    .filter((id) => first.includes(id));
  const relief = draft.pitchers.reliefRoles
    .map((p) => p.playerId)
    .filter((id) => first.includes(id));
  const candidateIds = tab === 'pitchers' ? pitcherIds : batterIds;
  const infoId = selected || order[0]!.playerId;
  const rules = view.definitions.registrationRules;
  const registrationLocked =
    locked || !draft.firstPlayerIds || draft.rosterPolicy?.changeMode === 'auto';
  const roleLocked = locked || !draft.reliefRoles || !view.definitions.reliefConfig;
  const preference = draft.rosterPolicy?.preferences.find((r) => r.playerId === infoId);

  function waiting(id: string) {
    const row = view.registration?.registrations.find((r) => r.playerId === id && r.until === null);
    return !first.includes(id) &&
      row?.category === 'farm' &&
      row.nextFirstEligibleOn &&
      row.nextFirstEligibleOn > view.currentDate
      ? row.nextFirstEligibleOn
      : null;
  }
  function lineup(rows: IdealLineup['battingOrder']): IdealLineup {
    return {
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
    };
  }
  function putBatter(index: number, id: string) {
    if (locked || !batterIds.includes(id) || waiting(id)) return;
    const crosses = !first.includes(id);
    if (crosses && registrationLocked) return;
    setSelected(id);
    const rows = structuredClone(order);
    const prior = rows.findIndex((r) => r.playerId === id);
    const outgoing = rows[index]!.playerId;
    // 打順交換には守備が付いて移動。控え・二軍から入る選手は枠の守備を継承。
    if (prior >= 0 && !crosses) [rows[index], rows[prior]] = [rows[prior]!, rows[index]!];
    else {
      if (prior >= 0 && prior !== index) rows[prior]!.playerId = outgoing;
      rows[index]!.playerId = id;
    }
    onChange({
      ...draft,
      lineup: lineup(rows),
      firstPlayerIds: crosses ? [...first.filter((p) => p !== outgoing), id] : draft.firstPlayerIds,
    });
  }
  function moveRegistration(id: string, toFirst: boolean, exchangeId?: string) {
    if (registrationLocked || !candidateIds.includes(id) || (toFirst && waiting(id))) return;
    if (first.includes(id) === toFirst) return;
    let ids = toFirst ? [...first, id] : first.filter((p) => p !== id);
    const rows = structuredClone(order);
    if (exchangeId && candidateIds.includes(exchangeId) && first.includes(exchangeId) === toFirst) {
      if (!toFirst && waiting(exchangeId)) return;
      ids = toFirst ? ids.filter((p) => p !== exchangeId) : [...ids, exchangeId];
      const out = toFirst ? exchangeId : id;
      const replacement = toFirst ? id : exchangeId;
      const index = rows.findIndex((r) => r.playerId === out);
      if (index >= 0) {
        const prior = rows.findIndex((r) => r.playerId === replacement);
        if (prior >= 0 && prior !== index) rows[prior]!.playerId = out;
        rows[index]!.playerId = replacement;
      }
    }
    setSelected(id);
    onChange({ ...draft, firstPlayerIds: [...new Set(ids)], lineup: lineup(rows) });
  }
  function placePitcher(
    id: string,
    target: 'rotation' | FormationReliefGroup,
    beforeId?: string,
    source?: FormationReliefGroup,
  ) {
    if (roleLocked || !pitcherIds.includes(id) || waiting(id)) return;
    if (!first.includes(id) && registrationLocked) return;
    const next = placeFormationPitcher(
      draft,
      id,
      target,
      view.definitions.reliefConfig!,
      beforeId,
      source,
    );
    if (next.firstPlayerIds && !first.includes(id)) next.firstPlayerIds.push(id);
    setSelected(id);
    onChange(next);
  }
  function statusLine(id: string, pitcher = false) {
    const state = view.playerStatuses.find((p) => p.playerId === id);
    const position =
      order.find((r) => r.playerId === id)?.battingRole ??
      squad.team.lineup.find((r) => r.playerId === id)?.position;
    return (
      <small className="formation-state">
        {pitcher ? '投手' : (position ?? '野手')} ／ 調子 {state?.condition ?? '—'} ／ 疲労{' '}
        {state?.fatigueMilli == null ? '—' : (state.fatigueMilli / 1000).toFixed(1)}
        {pitcher && (
          <>
            <br />
            前回登板 {state?.lastPitchedOn ?? '記録なし'} ／{' '}
            {state?.lastPitchCount == null ? '投球数なし' : state.lastPitchCount + '球'}
          </>
        )}
      </small>
    );
  }
  function endDrag() {
    setDragged(null);
    setDropTarget(null);
  }

  // 選手カード全体を移動元にする。入力欄の操作からはドラッグを始めない。
  function playerDrag(id: string, source?: FormationReliefGroup) {
    return {
      draggable: !locked && !waiting(id),
      'data-player-id': id,
      'data-dragging': dragged?.playerId === id || undefined,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        if (
          locked ||
          waiting(id) ||
          (e.target as HTMLElement).closest('input, select, summary, .formation-fallback')
        ) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer.clearData();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(PLAYER, id);
        if (source) e.dataTransfer.setData(ROLE, source);
        setSelected(id);
        setDragged({ playerId: id });
      },
    };
  }

  function dropArea(key: string, allowed: boolean) {
    return {
      'data-drop-target': key,
      'data-drop-active': dropTarget === key || undefined,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        e.stopPropagation();
        if (!allowed) {
          setDropTarget(null);
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(key);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setDropTarget((current) => (current === key ? null : current));
        }
      },
    };
  }

  const draggedPlayer = dragged?.playerId;
  const canRegister =
    !!draggedPlayer && !registrationLocked && candidateIds.includes(draggedPlayer);
  const canPlacePitcher =
    !!draggedPlayer &&
    !roleLocked &&
    pitcherIds.includes(draggedPlayer) &&
    !waiting(draggedPlayer) &&
    (first.includes(draggedPlayer) || !registrationLocked);
  const canPlaceBatter =
    !!draggedPlayer &&
    !locked &&
    batterIds.includes(draggedPlayer) &&
    !waiting(draggedPlayer) &&
    (first.includes(draggedPlayer) || !registrationLocked);

  function playerButton(id: string) {
    return (
      <button className="player-link" aria-pressed={infoId === id} onClick={() => setSelected(id)}>
        {name(id)}
      </button>
    );
  }
  function registrationButton(id: string) {
    const date = waiting(id);
    return (
      <button
        disabled={registrationLocked || !!date}
        aria-label={`${name(id)}を${first.includes(id) ? '二軍' : '一軍'}へ`}
        onClick={() => moveRegistration(id, !first.includes(id))}
      >
        {first.includes(id) ? '二軍へ' : '一軍へ'}
      </button>
    );
  }
  function group(title: string, ids: string[], toFirst: boolean) {
    return (
      <section
        className="formation-column"
        aria-label={title}
        {...dropArea(
          title,
          canRegister &&
            first.includes(draggedPlayer!) !== toFirst &&
            (!toFirst || !waiting(draggedPlayer!)),
        )}
        onDrop={(e) => {
          e.preventDefault();
          moveRegistration(e.dataTransfer.getData(PLAYER), toFirst);
        }}
      >
        <h4>
          {title}（{ids.length}人）
        </h4>
        {ids.map((id) => (
          <div
            className="formation-player"
            key={id}
            {...playerDrag(id)}
            {...dropArea(
              title + id,
              canRegister &&
                first.includes(draggedPlayer!) !== toFirst &&
                !waiting(toFirst ? draggedPlayer! : id),
            )}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              moveRegistration(e.dataTransfer.getData(PLAYER), toFirst, id);
            }}
          >
            <div className="formation-card-heading">
              <span className="formation-grip" aria-hidden="true">
                ⠿
              </span>
              {playerButton(id)}
            </div>
            {statusLine(id, tab === 'pitchers')}
            {waiting(id) && <small>再登録可能：{waiting(id)}</small>}
            <div className="formation-fallback formation-actions" hidden={!showControls}>
              {registrationButton(id)}
            </div>
          </div>
        ))}
        {ids.length === 0 && <p>該当する選手はいません。</p>}
        <p className="formation-drop-space">
          {toFirst ? '二軍からここへ移動して一軍登録' : '一軍からここへ移動して二軍登録'}
        </p>
      </section>
    );
  }
  function pitcherRow(
    id: string,
    index: number,
    ids: string[],
    target: 'rotation' | FormationReliefGroup,
  ) {
    const rule = draft.reliefRoles?.find(
      (r) => r.playerId === id && formationReliefGroup(r) === target,
    );
    return (
      <div
        className="formation-player"
        key={id}
        {...playerDrag(id, target === 'rotation' ? undefined : target)}
        {...dropArea(target + id, canPlacePitcher)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const source = e.dataTransfer.getData(ROLE) as FormationReliefGroup;
          placePitcher(e.dataTransfer.getData(PLAYER), target, id, source || undefined);
        }}
      >
        <div className="formation-card-heading">
          <span className="formation-grip" aria-hidden="true">
            ⠿
          </span>
          <span>{index + 1}.</span> {playerButton(id)}
        </div>
        {statusLine(id, true)}
        <div className="formation-fallback" hidden={!showControls}>
          <div className="formation-actions">
            <button
              aria-label={`${name(id)}の優先順を上げる`}
              disabled={roleLocked || index === 0}
              onClick={() =>
                placePitcher(id, target, ids[index - 1], target === 'rotation' ? undefined : target)
              }
            >
              ↑
            </button>
            <button
              aria-label={`${name(id)}の優先順を下げる`}
              disabled={roleLocked || index === ids.length - 1}
              onClick={() =>
                placePitcher(id, target, ids[index + 2], target === 'rotation' ? undefined : target)
              }
            >
              ↓
            </button>
            <button
              disabled={roleLocked}
              onClick={() => placePitcher(id, target === 'rotation' ? 'close' : 'rotation')}
            >
              {target === 'rotation' ? '救援へ' : '先発へ'}
            </button>
            {registrationButton(id)}
          </div>
          <label>
            配置先
            <select
              aria-label={`${name(id)}の配置先`}
              disabled={roleLocked}
              value={target}
              onChange={(e) =>
                placePitcher(
                  id,
                  e.target.value as 'rotation' | FormationReliefGroup,
                  undefined,
                  target === 'rotation' ? undefined : target,
                )
              }
            >
              <option value="rotation">先発ローテーション</option>
              {formationReliefGroups.map((key) => (
                <option key={key} value={key}>
                  {formationReliefLabels[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {rule && (
          <details className="formation-conditions">
            <summary>
              登板条件（{rule.conditions.startInning}〜{rule.conditions.endInning}回・点差{' '}
              {rule.conditions.minScoreDifference ?? '制限なし'}〜
              {rule.conditions.maxScoreDifference ?? '制限なし'}）
            </summary>
            <fieldset disabled={locked}>
              {(
                [
                  ['startInning', '開始回'],
                  ['endInning', '終了回'],
                  ['minScoreDifference', '点差下限'],
                  ['maxScoreDifference', '点差上限'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    aria-label={`${name(id)}の${formationReliefLabels[target as FormationReliefGroup]}の${label}`}
                    value={rule.conditions[key] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        reliefRoles: draft.reliefRoles!.map((r) =>
                          r === rule
                            ? {
                                ...r,
                                conditions: {
                                  ...r.conditions,
                                  [key]: e.target.value === '' ? null : Number(e.target.value),
                                },
                              }
                            : r,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              {(
                [
                  ['lead', 'リード'],
                  ['tied', '同点'],
                  ['trailing', 'ビハインド'],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={rule.conditions.scoreStates.includes(key)}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        reliefRoles: draft.reliefRoles!.map((r) =>
                          r === rule
                            ? {
                                ...r,
                                conditions: {
                                  ...r.conditions,
                                  scoreStates: e.target.checked
                                    ? [...r.conditions.scoreStates, key]
                                    : r.conditions.scoreStates.filter((s) => s !== key),
                                },
                              }
                            : r,
                        ),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </details>
        )}
      </div>
    );
  }
  return (
    <section
      className="panel formation-editor"
      aria-label="編成の編集"
      onDragEnd={endDrag}
      onDropCapture={endDrag}
    >
      <h3>{squad.team.name}の編成</h3>
      <p role="status">
        {changed ? '変更中 — 編成を離れると検証して自動保存します。' : '変更はありません。'}
      </p>
      <p>
        {view.currentDate}の登録案：一軍 {first.length}/{rules?.firstLimit ?? '—'}人（投手{' '}
        {pitcherIds.filter((id) => first.includes(id)).length}人を含む） ／ 二軍{' '}
        {squad.players.length - first.length}人
      </p>
      <p>
        {view.currentDate}の確定状態からのベンチ見込み：
        {view.registrationPreview?.roster.playerIds.length ?? '—'}/{rules?.benchLimit ?? '—'}
        人（編集案の反映前）
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
      <div hidden={tab !== 'policy'}>
        <FormationPolicy view={view} draft={draft} locked={locked} onChange={onChange} />
      </div>
      <div hidden={tab === 'policy'}>
        <div className="formation-drag-guide">
          <p>
            {tab === 'pitchers'
              ? '⠿ 投手カードをドラッグして配置。役割の変更や、先発順・役割内の優先順を変更できます。'
              : '⠿ 選手カードをドラッグして配置。守備位置のアイコンは、アイコン同士で交換できます。'}
          </p>
          <button aria-pressed={showControls} onClick={() => setShowControls(!showControls)}>
            選択欄・ボタンで操作
          </button>
          <small>キーボードやタッチで操作する場合はこちらを開いてください。</small>
        </div>
        <p className="formation-drag-status" role="status" aria-live="polite">
          {dragged?.position != null
            ? '守備位置を交換：別の守備アイコンへドロップ'
            : draggedPlayer
              ? `${name(draggedPlayer)}を移動中：枠に重ねてドロップ`
              : '選手名をクリックすると右端に詳細を表示します。'}
        </p>
        {draft.rosterPolicy?.changeMode === 'auto' && (
          <p>
            自動管理中です。直接の昇降格は起用方針で手動へ切り替えると行えます。固定希望は退出時に反映します。
          </p>
        )}
        <div className="formation-columns">
          {tab !== 'pitchers' ? (
            <>
              <section className="formation-column" aria-label="理想オーダー">
                <h4>一軍オーダー</h4>
                {order.map((row, index) => (
                  <div
                    className="formation-slot"
                    key={row.slotNo}
                    {...(first.includes(row.playerId) ? playerDrag(row.playerId) : {})}
                    {...dropArea(
                      'order-' + index,
                      canPlaceBatter || (!locked && dragged?.position != null),
                    )}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (locked) return;
                      const position = e.dataTransfer.getData(POSITION);
                      if (position !== '') {
                        const from = Number(position);
                        if (!Number.isInteger(from) || from < 0 || from > 8) return;
                        const rows = structuredClone(order);
                        [rows[index]!.battingRole, rows[from]!.battingRole] = [
                          rows[from]!.battingRole,
                          rows[index]!.battingRole,
                        ];
                        onChange({ ...draft, lineup: lineup(rows) });
                      } else putBatter(index, e.dataTransfer.getData(PLAYER));
                    }}
                  >
                    <div className="formation-card-heading">
                      <span className="formation-grip" aria-hidden="true">
                        ⠿
                      </span>
                      <span>{index + 1}番</span>{' '}
                      {first.includes(row.playerId) ? (
                        playerButton(row.playerId)
                      ) : (
                        <strong>空き枠（二軍へ移動中）</strong>
                      )}
                      <span
                        className="formation-position"
                        draggable={!locked}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.clearData();
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData(POSITION, String(index));
                          setDragged({ position: index });
                          setSelected(row.playerId);
                        }}
                        title="守備位置をドラッグして交換"
                        aria-label={`${index + 1}番の守備位置 ${row.battingRole}`}
                      >
                        {row.battingRole} ↔
                      </span>
                    </div>
                    {first.includes(row.playerId) && statusLine(row.playerId)}
                    <div className="formation-fallback" hidden={!showControls}>
                      <select
                        aria-label={`${index + 1}番の選手`}
                        value={first.includes(row.playerId) ? row.playerId : ''}
                        disabled={locked}
                        onChange={(e) => putBatter(index, e.target.value)}
                      >
                        <option value="" disabled>
                          選手を配置してください
                        </option>
                        {batterIds.map((id) => (
                          <option
                            key={id}
                            value={id}
                            disabled={!first.includes(id) && (registrationLocked || !!waiting(id))}
                          >
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
                            onChange({ ...draft, lineup: lineup(rows) });
                          }}
                        >
                          {POSITIONS.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
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
                        {first.includes(row.playerId) && registrationButton(row.playerId)}
                      </div>
                    </div>
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
              <section
                className="formation-column"
                aria-label="先発ローテーション"
                {...dropArea('rotation', canPlacePitcher)}
                onDrop={(e) => {
                  e.preventDefault();
                  placePitcher(e.dataTransfer.getData(PLAYER), 'rotation');
                }}
              >
                <h4>先発ローテーション</h4>
                {rotation.map((id, index) => pitcherRow(id, index, rotation, 'rotation'))}
                <p className="formation-drop-space">ここへ投手を追加（ローテーションの最後へ）</p>
                <label>
                  次の先発枠
                  <select
                    aria-label="次の先発枠"
                    disabled={locked}
                    value={draft.pitchers.nextSlotNo}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        pitchers: { ...draft.pitchers, nextSlotNo: Number(e.target.value) },
                      })
                    }
                  >
                    {draft.pitchers.rotationSlots.map((row) => (
                      <option key={row.playerId} value={row.slotNo}>
                        {row.slotNo}：{name(row.playerId)}
                        {first.includes(row.playerId) ? '' : '（二軍・当日は代役）'}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section className="formation-column" aria-label="救援">
                <h4>救援</h4>
                {formationReliefGroups.map((key) => {
                  const ids = (draft.reliefRoles ?? [])
                    .filter((r) => formationReliefGroup(r) === key && relief.includes(r.playerId))
                    .sort(
                      (a, b) =>
                        a.priority - b.priority ||
                        relief.indexOf(a.playerId) - relief.indexOf(b.playerId),
                    )
                    .map((r) => r.playerId);
                  return (
                    <section
                      className="formation-relief-group"
                      aria-label={formationReliefLabels[key]}
                      key={key}
                      {...dropArea(key, canPlacePitcher)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const source = e.dataTransfer.getData(ROLE) as FormationReliefGroup;
                        placePitcher(
                          e.dataTransfer.getData(PLAYER),
                          key,
                          undefined,
                          source || undefined,
                        );
                      }}
                    >
                      <h5>
                        {formationReliefLabels[key]}（{ids.length}人）
                      </h5>
                      {ids.map((id, index) => pitcherRow(id, index, ids, key))}
                      <p className="formation-drop-space">ここへ投手を追加（優先順の最後へ）</p>
                    </section>
                  );
                })}
                <section className="formation-relief-group" aria-label="ワンポイント">
                  <h5>ワンポイント</h5>
                  <button disabled>工事中</button>
                  <p className="hint">専用起用方針との対応は仕様未決定です。</p>
                </section>
                {relief
                  .filter((id) => !draft.reliefRoles?.some((r) => r.playerId === id))
                  .map((id) => (
                    <div className="formation-player" key={id} {...playerDrag(id)}>
                      <div className="formation-card-heading">
                        <span className="formation-grip" aria-hidden="true">
                          ⠿
                        </span>
                        {playerButton(id)}
                      </div>
                      <span>役割未設定</span>
                      <button
                        hidden={!showControls}
                        disabled={roleLocked}
                        onClick={() => placePitcher(id, 'close')}
                      >
                        僅差へ配置
                      </button>
                    </div>
                  ))}
              </section>
            </>
          )}
          {group(
            tab === 'pitchers' ? '二軍投手' : '二軍野手',
            candidateIds.filter((id) => !first.includes(id)),
            false,
          )}
          <aside className="formation-column formation-info" aria-label="選択選手情報">
            <p>{first.includes(infoId) ? '一軍案' : '二軍案'} ／ 怪我：記録なし</p>
            {preference && (
              <label>
                登録の固定希望
                <select
                  aria-label={`${name(infoId)}の固定希望`}
                  disabled={locked}
                  value={preference.preference}
                  onChange={(e) =>
                    onChange({
                      ...draft,
                      rosterPolicy: {
                        ...draft.rosterPolicy!,
                        preferences: draft.rosterPolicy!.preferences.map((r) =>
                          r.playerId === infoId
                            ? { ...r, preference: e.target.value as RosterPreference }
                            : r,
                        ),
                      },
                    })
                  }
                >
                  <option value="auto">おまかせ</option>
                  <option value="firstFixed">一軍固定</option>
                  <option value="farmFixed">二軍固定</option>
                </select>
              </label>
            )}
            <PlayerDetails
              view={view}
              playerId={infoId}
              inline
              registrationDraft={first.includes(infoId) ? 'first' : 'farm'}
              onClose={() => {}}
            />
            <button onClick={() => onSelectPlayer(infoId)}>選手詳細を開く</button>
          </aside>
        </div>
        <p className="hint">
          選手の枠への移動は交換、二軍・一軍控えの空き領域への移動は登録案だけを変更します。守備アイコンは守備だけを交換します。空き枠は退出前に補充してください。
        </p>
        {tab === 'pitchers' && (
          <p className="hint">
            優先順・休養状態・回と点差の条件を使って自動起用します。既存の通常救援は僅差欄に表示し、保存済みの点差条件は維持します。新規の僅差指定は±
            {formationDefaults.closeGameScoreDifference}
            点の仮値で、登板条件から変更できます。二軍の通常起用案は保持します。
          </p>
        )}
      </div>
    </section>
  );
}
