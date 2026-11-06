import { useEffect, useRef, useState } from 'react';
import type {
  InspectTrade,
  TradeInspectionReport,
} from '../../recruitment/trade-inspection-types.ts';
import { TradeInspectionResult } from './TradeInspectionResult.tsx';
import type { WorldView } from '../../world/controller.ts';
import {
  COMMON_ABILITIES,
  EXISTING_ABILITY_CODES,
  type CommonAbilityCode,
} from '../../players/abilities.ts';
import { AbilityRating } from '../visuals/AbilityRating.tsx';
import { TradePlayerPicker } from './TradePlayerPicker.tsx';
import {
  emptyTradeDraft,
  previewTrade,
  tradeAbilities,
  tradePlayerName,
  type TradeDraft,
} from './trade-preview.ts';
import './trade.css';

type Side = 'outgoingIds' | 'incomingIds';
const sideNames: Record<Side, string> = { outgoingIds: '出す選手', incomingIds: '獲得する選手' };
const groups = {
  batting: '打撃',
  running: '走塁',
  fielding: '守備',
  catching: '捕手',
  physical: '身体',
  pitching: '投手',
};

/** 下書きはUI内だけ。確認はWorker正本の読取で、交渉・移籍・保存は行わない。 */
export function TradePanel({
  view,
  draft,
  onChange: updateDraft,
  onSelectPlayer,
  disabled,
  onInspect,
}: {
  view: WorldView;
  draft: TradeDraft;
  onChange: (draft: TradeDraft) => void;
  onSelectPlayer: (id: string) => void;
  disabled: boolean;
  onInspect: InspectTrade;
}) {
  const [picker, setPicker] = useState<{ side: Side; index: number | null } | null>(null);
  const [group, setGroup] = useState('batting');
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const partnerSelect = useRef<HTMLSelectElement>(null);
  const preview = previewTrade(view, draft);
  const [checking, setChecking] = useState(false);
  const [inspection, setInspection] = useState<{
    key: string;
    report: TradeInspectionReport;
  } | null>(null);
  const [inspectionError, setInspectionError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const inspectionKey = JSON.stringify([
    view.localWorldId,
    view.worldId,
    view.revision,
    draft.partnerId,
    draft.outgoingIds,
    draft.incomingIds,
    draft.moneyText,
  ]);
  const currentKey = useRef(inspectionKey);
  currentKey.current = inspectionKey;
  const inspectionSequence = useRef(0);
  useEffect(
    () => () => {
      inspectionSequence.current += 1;
    },
    [],
  );

  function onChange(next: TradeDraft) {
    // 条件を戻した場合も、途中で変更した下書きへの遅れた応答は採用しない。
    inspectionSequence.current += 1;
    setInspection(null);
    setInspectionError(null);
    setChecking(false);
    updateDraft(next);
  }

  async function inspect() {
    if (disabled || checking || preview.errors.length || preview.money === null) return;
    const key = inspectionKey;
    const sequence = ++inspectionSequence.current;
    setChecking(true);
    setInspection(null);
    setInspectionError(null);
    try {
      const report = await onInspect({
        partnerSquadId: draft.partnerId,
        outgoingIds: [...draft.outgoingIds],
        incomingIds: [...draft.incomingIds],
        cashYen: preview.money,
      });
      if (sequence === inspectionSequence.current && key === currentKey.current)
        setInspection({ key, report });
    } catch (error) {
      if (sequence === inspectionSequence.current && key === currentKey.current)
        setInspectionError({
          key,
          message: error instanceof Error ? error.message : '確認に失敗しました。',
        });
    } finally {
      if (sequence === inspectionSequence.current) setChecking(false);
    }
  }
  const selected = [...draft.outgoingIds, ...draft.incomingIds];
  const columns = selected.map((id) => ({ id, values: tradeAbilities(view, id) }));
  const closePicker = () => {
    setPicker(null);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
      else heading.current?.focus();
    });
  };
  const choose = (id: string) => {
    if (!picker) return;
    const ids = [...draft[picker.side]];
    if (picker.index === null) ids.push(id);
    else ids[picker.index] = id;
    onChange({ ...draft, [picker.side]: ids });
    closePicker();
  };
  const openPicker = (side: Side, index: number | null, element: HTMLButtonElement) => {
    trigger.current = element;
    setPicker({ side, index });
  };
  function sidePanel(side: Side) {
    const squad = side === 'outgoingIds' ? preview.own : preview.partner;
    return (
      <fieldset className="trade-side">
        <legend>{side === 'outgoingIds' ? '自球団が出す選手' : '相手から獲得する選手'}</legend>
        <h4>{squad?.team.name ?? '相手球団を選択してください'}</h4>
        <ol>
          {draft[side].map((id, index) => (
            <li key={index}>
              <button
                onClick={(event) => openPicker(side, index, event.currentTarget)}
                aria-label={`${sideNames[side]}：${tradePlayerName(view, id)}を選び直す`}
              >
                {tradePlayerName(view, id)}
                <small>選び直す</small>
              </button>
              <button
                className="secondary"
                onClick={() => onSelectPlayer(id)}
                aria-label={`${tradePlayerName(view, id)}の詳細`}
              >
                詳細
              </button>
              <button
                className="secondary"
                aria-label={`${sideNames[side]}から${tradePlayerName(view, id)}を解除`}
                onClick={() => {
                  onChange({ ...draft, [side]: draft[side].filter((_, i) => i !== index) });
                  heading.current?.focus();
                }}
              >
                解除 ×
              </button>
            </li>
          ))}
        </ol>
        <button
          className="trade-add"
          disabled={!squad || draft[side].length >= squad.players.length}
          onClick={(event) => openPicker(side, null, event.currentTarget)}
        >
          ＋ {sideNames[side]}を追加
        </button>
        {side === 'outgoingIds' && (
          <label className="trade-money">
            提示金銭（円）
            <input
              inputMode="numeric"
              value={draft.moneyText}
              aria-describedby="trade-money-hint"
              onChange={(event) => onChange({ ...draft, moneyText: event.target.value })}
            />
          </label>
        )}
      </fieldset>
    );
  }
  return (
    <section className="trade-panel panel" aria-label="トレード提案の作成">
      <header className="trade-heading">
        <h3 ref={heading} tabIndex={-1}>
          トレード提案 <small>未提出</small>
        </h3>
        <button
          className="secondary"
          onClick={() => {
            onChange(emptyTradeDraft());
            partnerSelect.current?.focus();
          }}
        >
          提案をクリア
        </button>
      </header>
      <p>
        選手と金銭を組み合わせ、人数の変化を確認できます。選択だけで移籍や支払いは発生しません。
      </p>
      <label>
        相手球団
        <select
          ref={partnerSelect}
          value={draft.partnerId}
          onChange={(event) =>
            onChange({ ...draft, partnerId: event.target.value, incomingIds: [] })
          }
        >
          <option value="">相手球団を選択</option>
          {view.definitions.squads
            .filter((s) => s.squadId !== preview.own?.squadId)
            .map((s) => (
              <option key={s.squadId} value={s.squadId}>
                {s.team.name}
              </option>
            ))}
        </select>
      </label>
      <p className="hint">
        相手球団を変えると、相手側の選択を解除します。下書きはセーブ対象外で、タイトルへの移動や再読み込みで破棄します。
      </p>
      {!preview.own ? (
        <p role="status">担当球団の記録がない保存では、トレード提案を作成できません。</p>
      ) : (
        <>
          <div className="trade-sides">
            {sidePanel('outgoingIds')}
            {sidePanel('incomingIds')}
          </div>
          <p id="trade-money-hint" className="hint">
            金額は円単位の整数。提示金銭と獲得後の年俸負担は別です。
          </p>
          <p className="trade-draft-status" role="status">
            出す選手 {draft.outgoingIds.length}名 ／ 獲得する選手 {draft.incomingIds.length}名 ／
            未提出
          </p>
          <section aria-label="トレード提案の入力確認">
            <h4>入力の確認</h4>
            {preview.errors.length ? (
              <ul>
                {preview.errors.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : (
              <p>入力に重複・所属の不一致はありません。交渉成立を示すものではありません。</p>
            )}
          </section>
          <section aria-label="トレード成立後の人数試算">
            <h4>
              人数の試算 <small>現在 → 成立後</small>
            </h4>
            <p className="hint">
              所属名簿の人数です。支配下区分・契約上限は未記録のため、支配下人数や成立可否とは区別します。主守備位置で一人一回だけ数えます。
            </p>
            {preview.ownCounts && preview.partnerCounts ? (
              <div
                className="world-table"
                tabIndex={0}
                role="region"
                aria-label="トレード人数表の横スクロール"
              >
                <table aria-label="所属人数と主守備位置別人数">
                  <thead>
                    <tr>
                      <th>主位置</th>
                      <th>{preview.own?.team.name}</th>
                      <th>{preview.partner?.team.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">所属合計</th>
                      <td data-testid="trade-own-count">
                        {preview.ownCounts.before} → {preview.ownCounts.after}
                      </td>
                      <td data-testid="trade-partner-count">
                        {preview.partnerCounts.before} → {preview.partnerCounts.after}
                      </td>
                    </tr>
                    {Object.keys(preview.ownCounts.positionsBefore).map((position) => (
                      <tr key={position}>
                        <th scope="row">{position}</th>
                        <td>
                          {preview.ownCounts!.positionsBefore[position]} →{' '}
                          {preview.ownCounts!.positionsAfter[position]}
                        </td>
                        <td>
                          {preview.partnerCounts!.positionsBefore[position]} →{' '}
                          {preview.partnerCounts!.positionsAfter[position]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>相手球団と名簿の整合性を確認すると、人数の試算を表示します。</p>
            )}
          </section>
          <section aria-label="トレード選手の能力比較">
            <h4>選んだ選手の能力比較</h4>
            <p className="hint">
              {view.currentDate}
              現在の基本能力です。未接続の能力は試合への作用が未実装です。成績・状態は各選手の「詳細」で確認できます。
            </p>
            {columns.length ? (
              <>
                <label>
                  比較する能力の分野
                  <select value={group} onChange={(event) => setGroup(event.target.value)}>
                    {Object.entries(groups).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="trade-scroll-hint">↔ 横にスクロールして全選手を比較</p>
                <div
                  className="world-table"
                  tabIndex={0}
                  role="region"
                  aria-label="トレード能力表の横スクロール"
                >
                  <table aria-label="トレード選手の基本能力">
                    <thead>
                      <tr>
                        <th>能力</th>
                        {columns.map((c, index) => (
                          <th key={`${index}-${c.id}`}>
                            <small>
                              {index < draft.outgoingIds.length ? '出す選手' : '獲得する選手'}
                            </small>
                            {tradePlayerName(view, c.id)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(Object.keys(COMMON_ABILITIES) as CommonAbilityCode[])
                        .filter((code) => code.startsWith(group + '.'))
                        .map((code) => (
                          <tr key={code}>
                            <th scope="row">
                              {COMMON_ABILITIES[code]}
                              {!(EXISTING_ABILITY_CODES as readonly string[]).includes(code) && (
                                <small>未接続</small>
                              )}
                            </th>
                            {columns.map((c, index) => (
                              <td key={`${index}-${c.id}`}>
                                {c.values[code] == null ? (
                                  '記録なし'
                                ) : (
                                  <AbilityRating
                                    valueMilli={c.values[code]!}
                                    label={`${tradePlayerName(view, c.id)}の${COMMON_ABILITIES[code]}`}
                                  />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>選手を枠へ入れると、同じ項目で比較できます。</p>
            )}
          </section>
          <section aria-label="トレードの資金と実行状況">
            <h4>資金と交渉</h4>
            <dl className="trade-finance">
              <div>
                <dt>提示金銭</dt>
                <dd>
                  {preview.money === null
                    ? '入力を確認'
                    : `${preview.money.toLocaleString('ja-JP')}円`}
                </dd>
              </div>
              <div>
                <dt>使用可能予算・成立後予算</dt>
                <dd>このプレイには記録なし</dd>
              </div>
              <div>
                <dt>獲得後の年俸負担</dt>
                <dd>契約の記録なし</dd>
              </div>
              <div>
                <dt>推定成功率</dt>
                <dd>算定未実装</dd>
              </div>
            </dl>
            <button
              disabled={disabled || checking || preview.errors.length > 0}
              onClick={() => void inspect()}
              aria-describedby="trade-inspection-hint"
            >
              {checking ? '成立条件を確認中…' : '成立条件を確認'}
            </button>
            <p id="trade-inspection-hint">
              現在の所属・登録・編成を確認します。提案の提出や移籍は行いません。
            </p>
            <div aria-live="polite" aria-busy={checking}>
              {inspectionError?.key === inspectionKey && (
                <p role="alert">{inspectionError.message}</p>
              )}
              {inspection?.key === inspectionKey && (
                <TradeInspectionResult view={view} report={inspection.report} />
              )}
            </div>
            <p id="trade-negotiation-hint">
              交渉・移籍の確定は工事中です。契約・予算の初期データ、交渉承認と保存への接続が必要です。
            </p>
            <button disabled aria-describedby="trade-negotiation-hint">
              交渉する（工事中）
            </button>
          </section>
        </>
      )}
      {picker && (
        <TradePlayerPicker
          view={view}
          squadId={(picker.side === 'outgoingIds' ? preview.own : preview.partner)!.squadId}
          excludedIds={draft[picker.side]}
          currentId={picker.index === null ? undefined : draft[picker.side][picker.index]}
          label={sideNames[picker.side]}
          onPick={choose}
          onClose={closePicker}
        />
      )}
    </section>
  );
}
