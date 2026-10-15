import { formationDefaults } from '../../config/formation.ts';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { WorldView } from '../world/controller.ts';
import { createFormationDraft } from '../world/formation-draft.ts';
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

type Placement = {
  playerId: string;
  kind: 'player' | 'position';
  source?: FormationReliefGroup;
};
type Destination = { key: string; label: string; apply: () => void };

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
  const [selectedRole, setSelectedRole] = useState<FormationReliefGroup>();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [operationMessage, setOperationMessage] = useState('');
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (placement)
      editorRef.current?.querySelector<HTMLButtonElement>('[data-placement-target]')?.focus();
  }, [placement]);
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
  const infoId = candidateIds.includes(selected) ? selected : candidateIds[0]!;
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
    setSelectedRole(target === 'rotation' ? undefined : target);
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
        setSelectedRole(source);
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

  function selectPlayer(id: string, source?: FormationReliefGroup) {
    setSelected(id);
    setSelectedRole(source);
    setPlacement(null);
  }

  function startPlacement(kind: Placement['kind']) {
    if (locked || waiting(infoId)) return;
    setPlacement({ playerId: infoId, kind, source: selectedRole });
    setOperationMessage('移動先を選んでください。矢印キーで移動、Enterで配置、Escapeで取消。');
  }

  const destinations: Destination[] = [];
  const sourceId = placement?.playerId;
  if (sourceId && !locked && !waiting(sourceId)) {
    const sourceIndex = order.findIndex((row) => row.playerId === sourceId);
    if (placement.kind === 'position' && sourceIndex >= 0) {
      order.forEach((_, index) => {
        if (index === sourceIndex) return;
        destinations.push({
          key: 'order-' + index,
          label: `${index + 1}番と守備を交換`,
          apply: () => {
            const rows = structuredClone(order);
            [rows[index]!.battingRole, rows[sourceIndex]!.battingRole] = [
              rows[sourceIndex]!.battingRole,
              rows[index]!.battingRole,
            ];
            onChange({ ...draft, lineup: lineup(rows) });
          },
        });
      });
    } else if (placement.kind === 'player') {
      if (
        tab === 'batters' &&
        batterIds.includes(sourceId) &&
        (first.includes(sourceId) || !registrationLocked)
      ) {
        order.forEach((row, index) => {
          if (row.playerId === sourceId && first.includes(sourceId)) return;
          destinations.push({
            key: 'order-' + index,
            label: `${index + 1}番へ配置`,
            apply: () => putBatter(index, sourceId),
          });
        });
      }
      if (
        tab === 'pitchers' &&
        !roleLocked &&
        pitcherIds.includes(sourceId) &&
        (first.includes(sourceId) || !registrationLocked)
      ) {
        const groups: ('rotation' | FormationReliefGroup)[] = [
          'rotation',
          ...formationReliefGroups,
        ];
        for (const target of groups) {
          const ids =
            target === 'rotation'
              ? rotation
              : (draft.reliefRoles ?? [])
                  .filter(
                    (row) => formationReliefGroup(row) === target && relief.includes(row.playerId),
                  )
                  .sort((a, b) => a.priority - b.priority)
                  .map((row) => row.playerId);
          const title = target === 'rotation' ? '先発' : formationReliefLabels[target];
          for (const id of ids.filter((id) => id !== sourceId)) {
            destinations.push({
              key: target + id,
              label: `${name(id)}の前へ配置`,
              apply: () => placePitcher(sourceId, target, id, placement.source),
            });
          }
          destinations.push({
            key: target,
            label: `${title}の最後へ配置`,
            apply: () => placePitcher(sourceId, target, undefined, placement.source),
          });
        }
      }
      if (!registrationLocked) {
        const toFirst = !first.includes(sourceId);
        const title = toFirst ? '一軍控え' : tab === 'pitchers' ? '二軍投手' : '二軍野手';
        // 投手の一軍側は先発・救援の配置先から登録する。
        if (tab === 'batters' || !toFirst) {
          destinations.push({
            key: title,
            label: toFirst ? '一軍控えへ登録' : '二軍へ登録',
            apply: () => moveRegistration(sourceId, toFirst),
          });
          const ids = candidateIds.filter(
            (id) =>
              first.includes(id) === toFirst &&
              (toFirst ? !order.some((row) => row.playerId === id) : !waiting(id)),
          );
          for (const id of ids) {
            destinations.push({
              key: title + id,
              label: `${name(id)}と登録を交換`,
              apply: () => moveRegistration(sourceId, toFirst, id),
            });
          }
        }
      }
    }
  }

  function focusSelected() {
    requestAnimationFrame(() =>
      editorRef.current
        ?.querySelector<HTMLButtonElement>('.formation-select[aria-pressed="true"]')
        ?.focus(),
    );
  }

  function cancelPlacement() {
    setPlacement(null);
    setOperationMessage('移動を取り消しました。');
    focusSelected();
  }

  function navigateDestination(event: KeyboardEvent<HTMLButtonElement>) {
    const buttons = [
      ...(editorRef.current?.querySelectorAll<HTMLButtonElement>('[data-placement-target]') ?? []),
    ];
    const index = buttons.indexOf(event.currentTarget);
    const delta = ['ArrowDown', 'ArrowRight'].includes(event.key)
      ? 1
      : ['ArrowUp', 'ArrowLeft'].includes(event.key)
        ? -1
        : 0;
    if (!delta) return;
    event.preventDefault();
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  }

  function placementTarget(key: string) {
    const target = destinations.find((destination) => destination.key === key);
    if (!target) return null;
    return (
      <button
        className="formation-place secondary"
        data-placement-target={key}
        onKeyDown={navigateDestination}
        onClick={() => {
          target.apply();
          setPlacement(null);
          setOperationMessage(
            `${name(sourceId!)}：${target.label}しました。編成を離れると保存します。`,
          );
          focusSelected();
        }}
      >
        {target.label}
      </button>
    );
  }

  function playerButton(id: string, source?: FormationReliefGroup) {
    return (
      <button
        className="player-link formation-select"
        aria-pressed={infoId === id}
        aria-describedby="formation-select-guide"
        onClick={() => selectPlayer(id, source)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || locked || waiting(id)) return;
          event.preventDefault();
          setSelected(id);
          setSelectedRole(source);
          setPlacement({ playerId: id, kind: 'player', source });
        }}
      >
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
        {placementTarget(title)}
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
            {placementTarget(title + id)}
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
          <span>{index + 1}.</span> {playerButton(id, target === 'rotation' ? undefined : target)}
        </div>
        {placementTarget(target + id)}
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
  const baseline = createFormationDraft(view);
  const changedFields = baseline
    ? (
        [
          'lineup',
          'pitchers',
          'firstPlayerIds',
          'rosterPolicy',
          'restPolicy',
          'reliefRoles',
        ] as const
      ).filter((key) => JSON.stringify(baseline[key]) !== JSON.stringify(draft[key])).length
    : 0;
  const emptySlots =
    draft.rosterPolicy?.changeMode === 'auto'
      ? []
      : order.filter((row) => !first.includes(row.playerId));
  const selectedIndex = order.findIndex((row) => row.playerId === infoId && first.includes(infoId));

  return (
    <section
      className="panel formation-editor"
      ref={editorRef}
      data-has-selection={!!selected && candidateIds.includes(selected) && tab !== 'policy'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && placement) {
          event.preventDefault();
          cancelPlacement();
        }
      }}
      aria-label="編成の編集"
      onDragEnd={endDrag}
      onDropCapture={endDrag}
    >
      <h3>{squad.team.name}の編成</h3>
      <div className="formation-summary">
        <strong role="status">
          {changed ? `変更中：${changedFields}項目` : '変更はありません。'}
        </strong>
        <button
          className="secondary"
          aria-describedby="formation-reset-hint"
          disabled={locked || !changed}
          onClick={() => {
            setPlacement(null);
            onReset();
          }}
        >
          変更を戻す
        </button>
        <span className="hint" id="formation-reset-hint">
          {changed ? '未確定の変更をすべて取り消します。' : '変更すると戻せます。'}
        </span>
      </div>
      <div className="formation-counts">
        <span>
          {view.currentDate}の登録案：一軍 {first.length}/{rules?.firstLimit ?? '—'}人（投手{' '}
          {pitcherIds.filter((id) => first.includes(id)).length}人）
        </span>
        <span>二軍 {squad.players.length - first.length}人</span>
        <span>
          {view.currentDate}のベンチ見込み：
          {view.registrationPreview?.roster.playerIds.length ?? '—'}/{rules?.benchLimit ?? '—'}
          人（編集案の反映前）
        </span>
      </div>
      {emptySlots.length > 0 && (
        <div className="formation-errors" aria-label="編成の修正箇所">
          <strong>エラー：空き枠 {emptySlots.length}件</strong>
          <p>一軍から外した選手の枠です。一軍選手で補充するか、変更を戻してください。</p>
          {emptySlots.map((row) => (
            <button
              className="secondary"
              key={row.slotNo}
              onClick={() => {
                setTab('batters');
                requestAnimationFrame(() =>
                  editorRef.current
                    ?.querySelector<HTMLElement>(`[data-slot="${row.slotNo}"]`)
                    ?.focus(),
                );
              }}
            >
              {row.slotNo}番の空き枠へ移動
            </button>
          ))}
        </div>
      )}
      <nav className="main-subnav" aria-label="編成の項目">
        <button
          aria-pressed={tab === 'batters'}
          onClick={() => {
            setTab('batters');
            setSelected('');
            setPlacement(null);
          }}
        >
          野手オーダー
        </button>
        <button
          aria-pressed={tab === 'pitchers'}
          onClick={() => {
            setTab('pitchers');
            setSelected('');
            setPlacement(null);
          }}
        >
          投手オーダー
        </button>
        <button
          aria-pressed={tab === 'policy'}
          onClick={() => {
            setTab('policy');
            setPlacement(null);
          }}
        >
          起用方針
        </button>
      </nav>
      {locked && <p className="hint">現在は閲覧のみです。当日の全試合を始める前に編集できます。</p>}
      <p className="hint">編成を離れると検証して自動保存します。</p>
      <details className="workflow-disclosure">
        <summary>編成の操作・保存について</summary>
        <p>
          タブの切替や選手詳細の閲覧では確定しません。再読込で未確定の編集は失われます。保存できなければこの画面で修正・取消できます。
        </p>
        <p>
          守備の交換は「守備を交換」、選手の交換は「移す」を選びます。配置先のボタンは矢印キーで移動し、Enterで確定、Escapeで取消できます。
        </p>
      </details>
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
          <button
            className="secondary"
            aria-pressed={showControls}
            onClick={() => setShowControls(!showControls)}
          >
            選択欄・ボタンで操作
          </button>
          <small id="formation-select-guide">
            選手名で選択して「移す」、または選手名にフォーカスしてEnterで移動先を選べます。従来の入力欄も開けます。
          </small>
        </div>
        <p className="formation-drag-status" role="status" aria-live="polite">
          {dragged?.position != null
            ? '守備位置を交換：別の守備アイコンへドロップ'
            : draggedPlayer
              ? `${name(draggedPlayer)}を移動中：枠に重ねてドロップ`
              : operationMessage ||
                '選手名で選択すると操作バーを表示します。詳細は「詳細を開く」で確認できます。'}
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
                    data-slot={index + 1}
                    tabIndex={-1}
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
                    {placementTarget('order-' + index)}
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
                {placementTarget('rotation')}
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
                      {placementTarget(key)}
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
        {selected && !dragged && candidateIds.includes(selected) && (
          <div className="formation-selection-bar" role="region" aria-label="選択選手の操作">
            <strong>{name(infoId)}を選択中</strong>
            <div className="formation-actions">
              {placement ? (
                <button className="secondary" onClick={cancelPlacement}>
                  移動を取り消す
                </button>
              ) : (
                <>
                  <button
                    disabled={
                      locked ||
                      !!waiting(infoId) ||
                      (!first.includes(infoId) && registrationLocked) ||
                      (tab === 'pitchers' && roleLocked)
                    }
                    onClick={() => startPlacement('player')}
                  >
                    移す
                  </button>
                  {tab === 'batters' && selectedIndex >= 0 && (
                    <>
                      <button
                        className="secondary"
                        disabled={locked || selectedIndex === 0}
                        onClick={() => putBatter(selectedIndex - 1, infoId)}
                      >
                        上へ
                      </button>
                      <button
                        className="secondary"
                        disabled={locked || selectedIndex === order.length - 1}
                        onClick={() => putBatter(selectedIndex + 1, infoId)}
                      >
                        下へ
                      </button>
                      <button
                        className="secondary"
                        disabled={locked}
                        onClick={() => startPlacement('position')}
                      >
                        守備を交換
                      </button>
                    </>
                  )}
                  <button
                    className="secondary"
                    disabled={registrationLocked || !!waiting(infoId)}
                    onClick={() => moveRegistration(infoId, !first.includes(infoId))}
                  >
                    {first.includes(infoId) ? '選択選手を二軍へ' : '選択選手を一軍へ'}
                  </button>
                </>
              )}
              <button className="secondary" onClick={() => onSelectPlayer(infoId)}>
                詳細を開く
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setSelected('');
                  setPlacement(null);
                }}
              >
                選択を解除
              </button>
            </div>
            {placement && (
              <small>強調された配置先を選択。矢印で移動・Enterで配置・Escapeで取消。</small>
            )}
            {waiting(infoId) && (
              <small>再登録可能：{waiting(infoId)}。それまでは移動できません。</small>
            )}
            {registrationLocked && <small>登録変更は手動管理・試合開始前のみ行えます。</small>}
          </div>
        )}
      </div>
    </section>
  );
}
