import { initialCandidatePreviewConfig } from '../../config/initial-candidate-preview.ts';
import { createInitial2026PitchProfiles } from '../data/pitch-types/initial-2026.ts';
import { useEffect, useRef, useState } from 'react';
import type { CandidateDataset, CandidatePlayer } from '../initial-data/types.ts';
import type { CandidatePitchPreview } from '../initial-data/preview.ts';
import type { InitialDataRequest, InitialDataResponse } from '../initial-data/controller.ts';
import { candidateVelocityRange } from '../initial-data/preview.ts';
import { COMMON_ABILITIES, type CommonAbilityCode } from '../initial-data/abilities.ts';
import { pitchNames } from '../data/pitch-types/index.ts';
import { Zone } from './App.tsx';
import './initial-candidates.css';

const previewPitchCodes = new Set(createInitial2026PitchProfiles().profiles.map((p) => p.code));

const points = (v: number) => (v / 1000).toFixed(1);
const speed = (v: number) => (v / 100).toFixed(2);
const playerName = (p: CandidatePlayer) =>
  p.profile.displayName ?? `${p.profile.familyName} ${p.profile.givenName}`;
const groupNames = { P: '投手', C: '捕手', IF: '内野手', OF: '外野手' };
const origins = {
  'existing-statistical-proposal': '成績参考',
  'fictional-completion': '架空補完',
  'generated-proposal': '架空設定',
  'reference-guided-completion': '成績参考で補完',
};
const rulings = {
  ball: 'ボール',
  calledStrike: '見逃しストライク',
  swingingStrike: '空振り',
  foul: 'ファウル',
  inPlay: 'フェア接触',
};

export function InitialCandidatesApp() {
  const worker = useRef<Worker | null>(null),
    pending = useRef(true);
  const [dataset, setDataset] = useState<CandidateDataset | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState('');
  const [filter, setFilter] = useState(''),
    [group, setGroup] = useState('all');
  const [selected, setSelected] = useState(''),
    [selectedPitch, setSelectedPitch] = useState('');
  const [batterId, setBatterId] = useState(''),
    [seed, setSeed] = useState('20261020');
  const [balls, setBalls] = useState(0),
    [strikes, setStrikes] = useState(0);
  const [tab, setTab] = useState<'ability' | 'skills' | 'pitches' | 'status'>('ability');
  const [preview, setPreview] = useState<CandidatePitchPreview | null>(null);
  useEffect(() => {
    const instance = new Worker(new URL('../initial-data-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<InitialDataResponse>) => {
      pending.current = false;
      setBusy(false);
      if (!data.ok) {
        setError(data.error);
        return;
      }
      setError('');
      if (data.dataset) {
        setDataset(data.dataset);
        setSelected(data.dataset.players.find((p) => p.pitchRepertoires.length)?.playerId ?? '');
        setBatterId(
          data.dataset.players.find((p) => p.profile.positionGroup === 'OF')?.playerId ?? '',
        );
      }
      if (data.preview) setPreview(data.preview);
    };
    instance.onerror = () => {
      pending.current = false;
      setBusy(false);
      setError('初期候補Workerを起動できません。ページを再読み込みしてください。');
    };
    instance.postMessage({ kind: 'query' });
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);
  const filtered =
    dataset?.players.filter(
      (p) =>
        (group === 'all' || p.profile.positionGroup === group) &&
        playerName(p).replaceAll(' ', '').includes(filter.replaceAll(' ', '')),
    ) ?? [];
  const player = filtered.find((p) => p.playerId === selected) ?? filtered[0];
  const pitch =
    player?.pitchRepertoires.find((q) => q.pitchId === selectedPitch) ??
    player?.pitchRepertoires.find((q) => q.engineSupport === 'profile-required') ??
    player?.pitchRepertoires[0];
  const batters =
    dataset?.players.filter(
      (p) => p.playerId !== player?.playerId && p.profile.positionGroup !== 'P',
    ) ?? [];
  const previewBatterId =
    batters.find((p) => p.playerId === batterId)?.playerId ?? batters[0]?.playerId ?? '';
  useEffect(
    () => setPreview(null),
    [player?.playerId, pitch?.pitchId, previewBatterId, seed, balls, strikes],
  );
  const birth = player?.profile.birthplace;
  const region = birth?.regionId
    ? dataset?.locations.regions.find((r) => r.regionId === birth.regionId)?.name
    : dataset?.locations.countries.find((c) => c.countryCode === birth?.countryCode)?.name;
  function runPreview() {
    if (!worker.current || pending.current || !player || !pitch || !previewBatterId) return;
    if (
      !/^\d+$/.test(seed) ||
      !Number.isSafeInteger(Number(seed)) ||
      Number(seed) < 1 ||
      Number(seed) > 0xffffffff
    ) {
      setError('seedは1～4294967295の整数を入力してください。');
      return;
    }
    const request: InitialDataRequest = {
      kind: 'preview',
      pitcherId: player.playerId,
      pitchId: pitch.pitchId,
      batterId: previewBatterId,
      seed: Number(seed),
      count: { balls, strikes },
    };
    pending.current = true;
    setBusy(true);
    setError('');
    worker.current.postMessage(request);
  }
  const result = preview?.step.event.pitch;
  return (
    <main className="initial-candidates world-page">
      <header>
        <div className="eyebrow">INITIAL DATA / REVIEW & PITCH PREVIEW</div>
        <h1>2026年 初期データ候補</h1>
        <p>埼玉県・1球団70人の候補。正式プレイへは未投入です。</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {!dataset ? (
        <p role="status">
          {busy ? '初期候補を読み込んでいます…' : 'データを読み込めませんでした。'}
        </p>
      ) : (
        <>
          <section className="panel" aria-label="初期候補の選択">
            <p className="initial-candidate-note">
              候補値・上限は未校正です。ゲームの名簿・日付・成績・保存は変更しません。
            </p>
            <div className="initial-candidate-controls">
              <label>
                名前で絞り込み
                <input disabled={busy} value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
              <label>
                候補の区分
                <select disabled={busy} value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="all">全員</option>
                  {Object.entries(groupNames).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                候補選手
                <select
                  disabled={busy || !filtered.length}
                  value={player?.playerId ?? ''}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setSelectedPitch('');
                  }}
                >
                  {!filtered.length && <option value="">該当なし</option>}
                  {filtered.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {playerName(p)}（{groupNames[p.profile.positionGroup]}）
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              {filtered.length} / {dataset.players.length}人 ／ 資料更新日：{dataset.asOfDate}
            </p>
          </section>
          {player && (
            <section className="panel" aria-label="初期候補の詳細">
              <h2>{playerName(player)}</h2>
              <p>
                {player.profile.throwingHand === 'R' ? '右' : '左'}投・
                {player.profile.battingHand === 'R'
                  ? '右'
                  : player.profile.battingHand === 'L'
                    ? '左'
                    : '両'}
                打 ／ {region} ／ {player.profile.birthDate}生 ／ {player.profile.heightMm / 10}cm・
                {player.profile.weightGrams / 1000}kg
              </p>
              <p>
                代表位置：{player.profile.primaryPosition ?? '未決定'}
                {player.primaryPositionCandidate &&
                  ` ／ 位置案：${player.primaryPositionCandidate.positionCode}（未採用）`}{' '}
                ／ 外国人枠資格：未決定
              </p>
              <div className="initial-candidate-tabs" role="group" aria-label="候補の表示切替">
                {(
                  [
                    ['ability', '22能力・上限'],
                    ['skills', '適性・成長候補'],
                    ['pitches', '持ち球・1球検証'],
                    ['status', '由来・接続条件'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {(tab === 'ability' || tab === 'skills' || (tab === 'pitches' && pitch)) && (
                <p className="initial-candidate-table-hint">表は横にスクロールできます。</p>
              )}
              {tab === 'ability' && (
                <>
                  <p>能力は0～120。伸び代は内部値の「上限−現在」から計算しています。</p>
                  <div
                    className="world-table"
                    tabIndex={0}
                    role="region"
                    aria-label="候補能力の横スクロール"
                  >
                    <table aria-label="初期候補の22能力">
                      <thead>
                        <tr>
                          <th>能力</th>
                          <th>現在</th>
                          <th>上限</th>
                          <th>伸び代</th>
                          <th>現在能力のバー</th>
                          <th>由来</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.entries(COMMON_ABILITIES) as [CommonAbilityCode, string][]).map(
                          ([code, label]) => {
                            const a = player.commonAbilities[code];
                            return (
                              <tr key={code}>
                                <th>{label}</th>
                                <td>{points(a.valueMilli)}</td>
                                <td>{points(a.ceilingMilli)}</td>
                                <td>{points(a.ceilingMilli - a.valueMilli)}</td>
                                <td>
                                  <meter
                                    min={0}
                                    max={120}
                                    value={a.valueMilli / 1000}
                                    aria-label={label + '現在能力'}
                                  />
                                </td>
                                <td>{origins[a.candidateKind]}</td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>表示の精度</summary>
                    <p>
                      内部は0.001点刻み、表示は小数1桁です。上限・才能・向上心は架空の候補で、将来の到達を保証する評価ではありません。
                    </p>
                  </details>
                </>
              )}
              {tab === 'skills' && (
                <>
                  <p>
                    才能 {points(player.growthProfile.talentMilli)} ／ 向上心{' '}
                    {points(player.growthProfile.ambitionMilli)} ／ 先発適性{' '}
                    {points(player.pitchingAptitudes.starterMilli)} ／ 救援適性{' '}
                    {points(player.pitchingAptitudes.relieverMilli)}
                  </p>
                  <p>固定適性と習熟は別の候補です。成長・衰え・覚醒や適性の作用は未接続です。</p>
                  <div
                    className="world-table"
                    tabIndex={0}
                    role="region"
                    aria-label="候補位置技能の横スクロール"
                  >
                    <table aria-label="初期候補の9位置">
                      <thead>
                        <tr>
                          <th>位置</th>
                          <th>固定適性</th>
                          <th>習熟</th>
                          <th>習熟上限</th>
                          <th>習熟の伸び代</th>
                        </tr>
                      </thead>
                      <tbody>
                        {player.positionSkills.map((s) => (
                          <tr key={s.positionCode}>
                            <th>{s.positionCode}</th>
                            <td>{points(s.aptitudeMilli)}</td>
                            <td>{points(s.familiarity.valueMilli)}</td>
                            <td>{points(s.familiarity.ceilingMilli)}</td>
                            <td>{points(s.familiarity.ceilingMilli - s.familiarity.valueMilli)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {tab === 'pitches' && (
                <>
                  {!pitch ? (
                    <p>持ち球候補はありません。野手登板は未接続です。</p>
                  ) : (
                    <>
                      <p>
                        球種を1つ指定し、候補の制球・再現性・球速・回転から1球を計算します。配球案は表示だけで、自動配球には未接続です。
                      </p>
                      <div
                        className="world-table"
                        tabIndex={0}
                        role="region"
                        aria-label="候補持ち球の横スクロール"
                      >
                        <table aria-label="初期候補の持ち球">
                          <thead>
                            <tr>
                              <th>球種</th>
                              <th>中心 km/h</th>
                              <th>基本MAX km/h</th>
                              <th>制球 現在/上限</th>
                              <th>再現性 現在/上限</th>
                              <th>習得候補</th>
                              <th>配球案</th>
                              <th>確認事項</th>
                            </tr>
                          </thead>
                          <tbody>
                            {player.pitchRepertoires.map((q) => (
                              <tr key={q.pitchId}>
                                <th>{pitchNames[q.pitchTypeCode]}</th>
                                <td>{speed(q.velocity.typicalCentiKph)}</td>
                                <td>{speed(q.velocity.maxCentiKph)}</td>
                                <td>
                                  {points(q.control.valueMilli)} / {points(q.control.ceilingMilli)}
                                </td>
                                <td>
                                  {points(q.repeatability.valueMilli)} /{' '}
                                  {points(q.repeatability.ceilingMilli)}
                                </td>
                                <td>{(q.acquisitionProgressMilli / 1000).toFixed(3)}%</td>
                                <td>{(q.selectionWeight / 1000).toFixed(3)}%</td>
                                <td>
                                  {q.requiresRarePitchReview ? '僅少・採用未確定' : '候補'} ／
                                  {previewPitchCodes.has(q.pitchTypeCode)
                                    ? '1球検証対応'
                                    : '未対応'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="initial-candidate-controls">
                        <label>
                          検証する球種
                          <select
                            disabled={busy}
                            value={pitch.pitchId}
                            onChange={(e) => setSelectedPitch(e.target.value)}
                          >
                            {player.pitchRepertoires.map((q) => (
                              <option key={q.pitchId} value={q.pitchId}>
                                {pitchNames[q.pitchTypeCode]}
                                {q.requiresRarePitchReview ? '（僅少候補）' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          検証する打者
                          <select
                            disabled={busy}
                            value={previewBatterId}
                            onChange={(e) => setBatterId(e.target.value)}
                          >
                            {batters.map((p) => (
                              <option key={p.playerId} value={p.playerId}>
                                {playerName(p)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          検証seed
                          <input
                            disabled={busy}
                            inputMode="numeric"
                            value={seed}
                            onChange={(e) => setSeed(e.target.value)}
                          />
                        </label>
                        <label>
                          検証ボール
                          <select
                            disabled={busy}
                            value={balls}
                            onChange={(e) => setBalls(Number(e.target.value))}
                          >
                            {[0, 1, 2, 3].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          検証ストライク
                          <select
                            disabled={busy}
                            value={strikes}
                            onChange={(e) => setStrikes(Number(e.target.value))}
                          >
                            {[0, 1, 2].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p>
                        通常抽選で到達できる範囲：{speed(candidateVelocityRange(pitch).minCentiKph)}
                        ～{speed(candidateVelocityRange(pitch).maxCentiKph)} km/h
                        {!candidateVelocityRange(pitch).reachesBasicMax &&
                          ' ／ 基本MAXには届かない設定です（補正は未実施）'}
                      </p>
                      <p className="hint">
                        検証共通条件：打者積極性
                        {initialCandidatePreviewConfig.swingAggressionMilli / 1000}%。
                        全能力の試合接続や初期編成の採用を検証する画面ではありません。
                      </p>
                      <button
                        data-primary
                        disabled={
                          busy ||
                          !previewBatterId ||
                          pitch.acquisitionProgressMilli !== 100000 ||
                          !previewPitchCodes.has(pitch.pitchTypeCode)
                        }
                        onClick={runPreview}
                      >
                        {busy ? '計算中…' : 'この球種で1球検証'}
                      </button>
                      {result && (
                        <section
                          className="initial-candidate-result"
                          aria-label="候補の1球結果"
                          aria-live="polite"
                        >
                          <h3>
                            {pitchNames[result.pitchTypeCode]} ／ {rulings[result.ruling]}
                          </h3>
                          <strong>
                            {speed(result.velocityCentiKph)} <small>km/h</small>
                          </strong>
                          <div className="initial-candidate-measurements">
                            <Zone pitch={result} />
                            <dl>
                              <dt>横変化（無回転基準）</dt>
                              <dd>{result.measurement.horizontalBreakMm} mm</dd>
                              <dt>縦変化（無回転基準）</dt>
                              <dd>{result.measurement.verticalBreakMm} mm</dd>
                              <dt>回転数</dt>
                              <dd>{result.measurement.spinRateRpm} rpm</dd>
                              <dt>リリース左右</dt>
                              <dd>{result.measurement.release?.lateralMm} mm</dd>
                            </dl>
                          </div>
                          <p>
                            seed {preview!.request.seed} ／ 乱数消費{' '}
                            {preview!.step.trace.rngAfter.drawCount}
                            回。同じ入力で同じ結果を再現します。
                          </p>
                        </section>
                      )}
                    </>
                  )}
                </>
              )}
              {tab === 'status' && (
                <>
                  <p>
                    取込元：{dataset.datasetVersion} ／
                    球団名・開始日・資格・初期編成は未決定です。残り11球団は未収録です。
                  </p>
                  <p>
                    生年月日は出生年を維持した架空設定、出身地・体格は参考資料由来です。参考成績はゲーム内成績へ加算していません。
                  </p>
                  <details>
                    <summary>元資料時点の接続条件（保全）</summary>
                    <ul>
                      {player.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <p>
                      4追加球種の単球計算は今回接続しました。上記の元資料の記述は履歴として保持し、正式投入可の判定には使いません。
                    </p>
                  </details>
                  <details>
                    <summary>この選手の候補JSON</summary>
                    <pre>{JSON.stringify(player, null, 2)}</pre>
                  </details>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
