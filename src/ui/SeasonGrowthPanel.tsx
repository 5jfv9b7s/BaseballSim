import { useEffect, useId, useState } from 'react';
import type { WorldView } from '../world/controller.ts';
import type { SeasonGrowthReport, SeasonGrowthRow } from '../world/season-growth.ts';
import { worldSquad } from '../world/squads.ts';
import './season-growth.css';

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
const points = (value: number) => (value / 1000).toFixed(3).replace(/\.?0+$/, '');
type SortKey = 'name' | 'increase' | 'decrease' | 'net';

/** 年度末の確定値を表示する。フィルターや展開で進行・保存指示を送らない。 */
export function SeasonGrowthPanel({
  view,
  report,
  ownSquadId,
  onSelectPlayer,
}: {
  view: WorldView;
  report: SeasonGrowthReport | null;
  ownSquadId?: string;
  onSelectPlayer: (id: string) => void;
}) {
  const [club, setClub] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'net',
    descending: true,
  });
  const [expanded, setExpanded] = useState('');
  const hintId = useId();
  const ownClubId = worldSquad(view.definitions, ownSquadId ?? '')?.team.clubId;
  const squad =
    view.definitions.squads.find((s) => s.team.clubId === club) ??
    view.definitions.squads.find((s) => s.team.clubId === ownClubId) ??
    view.definitions.squads[0]!;
  const clubRows = report?.rows.filter((row) => row.clubId === squad.team.clubId) ?? [];
  const normalize = (value: string) =>
    value.normalize('NFKC').replace(/\s/g, '').toLocaleLowerCase('ja');
  const rows = clubRows
    .filter(
      (row) =>
        normalize(row.name).includes(normalize(search)) && (role === 'all' || row.role === role),
    )
    .sort((a, b) => {
      const comparison =
        sort.key === 'name' ? a.name.localeCompare(b.name, 'ja') : a[sort.key] - b[sort.key];
      return (sort.descending ? -comparison : comparison) || a.playerId.localeCompare(b.playerId);
    });
  const totals = clubRows.reduce(
    (sum, row) => ({
      increase: sum.increase + row.increase,
      decrease: sum.decrease + row.decrease,
      net: sum.net + row.net,
    }),
    { increase: 0, decrease: 0, net: 0 },
  );
  const detailRow = rows.find((row) => row.playerId === expanded);
  const detailsId = `${hintId}-details`;
  useEffect(() => {
    if (!detailRow) return;
    const element = document.getElementById(detailsId);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'start' });
  }, [detailRow?.playerId, detailsId]);
  function header(key: SortKey, label: string) {
    const selected = key === sort.key;
    return (
      <th
        scope="col"
        aria-sort={selected ? (sort.descending ? 'descending' : 'ascending') : 'none'}
      >
        <button
          type="button"
          onClick={() => setSort({ key, descending: selected ? !sort.descending : key !== 'name' })}
        >
          {label}
          {selected ? (sort.descending ? ' ▼' : ' ▲') : ' ↕'}
        </button>
      </th>
    );
  }
  function rowView(row: SeasonGrowthRow) {
    const open = expanded === row.playerId;
    return (
      <tr key={row.playerId} data-own-club={row.clubId === ownClubId}>
        <th scope="row" className="season-growth-name">
          <button
            className="player-link"
            type="button"
            onClick={() => onSelectPlayer(row.playerId)}
          >
            {row.name}
          </button>
        </th>
        <td>{row.position ?? '未記録'}</td>
        <td>{signed(row.increase)}</td>
        <td>{row.decrease}</td>
        <td>
          <strong>{signed(row.net)}</strong>
        </td>
        <td>
          <button
            type="button"
            id={`${hintId}-toggle-${row.playerId}`}
            aria-expanded={open}
            aria-controls={open ? detailsId : undefined}
            aria-label={`${row.name}の成長内訳`}
            onClick={() => setExpanded(open ? '' : row.playerId)}
          >
            {open ? '閉じる' : '内訳'} {open ? '−' : '+'}
          </button>
        </td>
      </tr>
    );
  }
  return (
    <section className="season-growth" aria-label="シーズンの能力成長">
      <h3>シーズンの能力成長</h3>
      {!report ? (
        <p>この保存には日次成長の記録がありません。</p>
      ) : (
        <>
          <p className="hint">
            {report.from}〜{report.through} ／ 日次確定 {report.completedTrainingDays}日 ／
            一軍・二軍共通の能力
          </p>
          <label>
            成長を確認する球団
            <select
              value={squad.team.clubId}
              onChange={(e) => {
                setClub(e.target.value);
                setExpanded('');
              }}
            >
              {view.definitions.squads.map((s) => (
                <option key={s.team.clubId} value={s.team.clubId}>
                  {s.team.name}
                  {s.team.clubId === ownClubId ? '（自球団）' : ''}
                </option>
              ))}
            </select>
          </label>
          <h4>
            {squad.team.name}
            {squad.team.clubId === ownClubId && (
              <span className="season-growth-own">自球団</span>
            )}{' '}
            ／ 所属{clubRows.length}人の合計
          </h4>
          <dl className="growth-totals" aria-label="球団の年間成長合計">
            <div>
              <dt>増加</dt>
              <dd>{signed(totals.increase)}</dd>
            </div>
            <div>
              <dt>減少</dt>
              <dd>{totals.decrease}</dd>
            </div>
            <div>
              <dt>差引</dt>
              <dd>{signed(totals.net)}</dd>
            </div>
          </dl>
          <div className="world-controls">
            <label>
              成長一覧の名前検索
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setExpanded('');
                }}
              />
            </label>
            <label>
              成長一覧の選手区分
              <select
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setExpanded('');
                }}
              >
                <option value="all">投手・野手すべて</option>
                <option value="pitcher">投手</option>
                <option value="fielder">野手</option>
              </select>
            </label>
          </div>
          <p className="hint" id={hintId}>
            {rows.length}人表示 ／
            能力ポイント。列名で並べ替え、内訳で小数の変化を確認できます。選手名から現在の詳細を開けます。
          </p>
          <div
            className="world-table season-growth-scroll"
            tabIndex={0}
            role="region"
            aria-label="年間成長一覧の横スクロール"
            aria-describedby={hintId}
          >
            <table aria-label="選手別の年間成長">
              <thead>
                <tr>
                  {header('name', '選手')}
                  <th scope="col">代表位置</th>
                  {header('increase', '増加')}
                  {header('decrease', '減少')}
                  {header('net', '差引')}
                  <th scope="col">能力別</th>
                </tr>
              </thead>
              <tbody>{rows.map(rowView)}</tbody>
            </table>
          </div>
          {!rows.length && <p role="status">条件に合う選手がいません。</p>}
          {detailRow && (
            <section
              id={detailsId}
              className="season-growth-detail"
              tabIndex={-1}
              aria-label={`${detailRow.name}の成長内訳`}
            >
              <div className="growth-heading">
                <h4>{detailRow.name}の能力変化</h4>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded('');
                    document.getElementById(`${hintId}-toggle-${detailRow.playerId}`)?.focus();
                  }}
                >
                  内訳を閉じる
                </button>
              </div>
              <p className="hint">
                {report.from}〜{report.through} ／ 横にスクロールして開始・終了値を比較 →
              </p>
              {detailRow.changes.length ? (
                <div
                  className="world-table season-growth-detail-scroll"
                  role="region"
                  aria-label="能力別内訳の横スクロール"
                  tabIndex={0}
                >
                  <table aria-label={`${detailRow.name}の能力変化`}>
                    <thead>
                      <tr>
                        <th scope="col">能力</th>
                        <th scope="col">開始</th>
                        <th scope="col">終了</th>
                        <th scope="col">表示差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailRow.changes.map((change) => (
                        <tr key={JSON.stringify(change.abilityRef)}>
                          <th scope="row">{change.label}</th>
                          <td>{points(change.beforeValue)}</td>
                          <td>{points(change.afterValue)}</td>
                          <td>{signed(change.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>この期間の能力変化はありません。</p>
              )}
            </section>
          )}

          <details>
            <summary>成長合計の対象と保存について</summary>
            <p>
              各能力の開始・終了時の表示整数の差を合計します。基本22能力・9位置の守備習熟・本人の球種の制球と再現性が対象です。固定適性・才能・向上心・上限・球速・一時状態は含めません。
            </p>
            <p>
              保存済みの初期値と日別履歴から、選択した大会の最終日時点を表示します。一軍・二軍の値を重複加算しません。球団合計は検索条件にかかわらず所属全選手が対象です。
            </p>
            <p>
              {view.growth?.version === 'daily-development-v3'
                ? '通常練習・実戦経験・年齢変化の実績を集計しています。覚醒・キャンプは工事中です。'
                : view.growth?.version === 'daily-development-v2'
                  ? '通常練習・実戦経験の実績を集計しています。加齢・覚醒・キャンプは工事中です。'
                  : '現在は通常練習の実績のみです。実戦経験・加齢・覚醒・キャンプは工事中です。'}
              選手詳細の現在値には、この大会の終了後の変化も含む場合があります。
            </p>
          </details>
        </>
      )}
    </section>
  );
}
