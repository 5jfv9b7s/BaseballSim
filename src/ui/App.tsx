import { useEffect, useRef, useState } from 'react';
import type { Command, View } from '../engine/session.ts';
import type { PitchRecord, Ruling, StopReason } from '../engine/types.ts';
import type { WorkerResponse } from '../worker.ts';
import { FIXTURE } from '../data/fixture.ts';

const rulingNames: Record<Ruling, string> = { ball: 'ボール', calledStrike: '見逃しストライク', swingingStrike: '空振り', foul: 'ファウル', inPlay: 'フェア接触' };
const pitchNames = { fastball: 'ストレート', slider: 'スライダー', fork: 'フォーク' };
const stops: Record<StopReason, string> = {
  walkPending: '4球目のボール。四球による出塁処理は未実装のため、ここで停止します。',
  strikeoutPending: '3ストライク相当。三振・捕球・走者の処理は未実装のため、ここで停止します。',
  inPlayPending: 'フェア接触。打球・守備・走塁は未実装のため、ここで停止します。',
};
const name = (playerId: string) => { const p = FIXTURE.players.find(p => p.playerId === playerId)!; return `${p.familyName} ${p.givenName}`; };

function Zone({ pitch }: { pitch?: PitchRecord }) {
  const px = (mm: number) => 180 + mm * 0.44;
  const pz = (mm: number) => 354 - mm * 0.25;
  return <svg viewBox="0 0 360 290" role="img" aria-label="捕手視点の投球位置。丸は実位置、十字は狙い。右がプラスX、上がプラスZ。">
    <rect x="85" y="79" width="190" height="150" rx="1" fill="#ffffff08" stroke="#9ab8a9" />
    {[148, 212].map(x => <line key={x} x1={x} x2={x} y1="79" y2="229" stroke="#ffffff26" />)}
    {[129, 179].map(y => <line key={y} x1="85" x2="275" y1={y} y2={y} stroke="#ffffff26" />)}
    <text x="180" y="28" textAnchor="middle" fill="#b8c9c1" fontSize="12">捕手から投手を見る</text>
    <text x="180" y="274" textAnchor="middle" fill="#b8c9c1" fontSize="12">左 −x　　ストライク分析ゾーン　　+x 右</text>
    {pitch && <>
      <line x1={px(pitch.intendedLocation.xMm)} y1={pz(pitch.intendedLocation.zMm)} x2={px(pitch.actualLocation.xMm)} y2={pz(pitch.actualLocation.zMm)} stroke="#e7bd67" strokeDasharray="4 4" />
      <path d={`M${px(pitch.intendedLocation.xMm) - 6},${pz(pitch.intendedLocation.zMm)}h12 M${px(pitch.intendedLocation.xMm)},${pz(pitch.intendedLocation.zMm) - 6}v12`} stroke="#e7bd67" strokeWidth="2" />
      <circle cx={px(pitch.actualLocation.xMm)} cy={pz(pitch.actualLocation.zMm)} r="6" fill="#faf6e9" stroke="#102a24" strokeWidth="2" />
    </>}
  </svg>;
}

export function App() {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(true);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(true);
  const [seed, setSeed] = useState('20260923');
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const instance = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      inFlight.current = false; setBusy(false);
      if (data.ok) { setView(data.view); setError(''); } else setError(data.error);
    };
    instance.onerror = () => { inFlight.current = false; setBusy(false); setError('計算Workerを起動できませんでした。ページを再読み込みしてください。'); };
    instance.postMessage({ kind: 'query' });
    return () => { instance.terminate(); worker.current = null; };
  }, []);

  function send(action: Pick<Extract<Command, { kind: 'reset' }>, 'kind' | 'payload'> | Pick<Extract<Command, { kind: 'advance' }>, 'kind' | 'payload'>) {
    if (!view || !worker.current || inFlight.current) return;
    if (action.kind === 'reset' && (!/^\d+$/.test(seed) || !Number.isInteger(Number(seed)) || Number(seed) < 1 || Number(seed) > 0xffffffff)) {
      setError('seedは1～4294967295の整数を入力してください。'); return;
    }
    const command: Command = { ...action, commandId: `ui-command-${++sequence.current}`, localWorldId: 'pitch-lab-local', expectedStateRevision: view.revision };
    inFlight.current = true; setBusy(true); setError(''); worker.current.postMessage(command);
  }

  const latest = view?.steps[view.steps.length - 1];
  const pitch = latest?.event.pitch;
  return <main>
    <header><div className="eyebrow">BASEBALL SIMULATOR / DEVELOPMENT 01</div><span className="badge">未校正の試作</span>
      <h1>1球から、試合をつくる。</h1><p>架空の投手と打者で、配球から打者の反応までを確認します。</p></header>
    <section className="matchup" aria-label="対戦選手">
      <div><span className="eyebrow">PITCHER · 青凪ハーバーズ</span><h2>{name(FIXTURE.matchup.pitcherId)} <small>右投</small></h2><p>捕手：{name(FIXTURE.matchup.catcherId)}</p></div>
      <span className="versus">VS</span><div><span className="eyebrow">BATTER · 星原フォックス</span><h2>{name(FIXTURE.matchup.batterId)} <small>左打</small></h2><p>対右ミート 80 / 選球眼 70</p></div>
    </section>
    <div className="workspace">
      <section className="panel controls"><h2>試行の設定</h2><p className="muted">同じseed・開始カウントで同じ投球を再現できます。</p>
        <label>乱数seed<input inputMode="numeric" value={seed} onChange={e => setSeed(e.target.value)} /></label>
        <div className="count-input"><label>開始ボール<select value={balls} onChange={e => setBalls(Number(e.target.value))}>{[0, 1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></label>
          <label>開始ストライク<select value={strikes} onChange={e => setStrikes(Number(e.target.value))}>{[0, 1, 2].map(n => <option key={n}>{n}</option>)}</select></label></div>
        <button className="secondary" disabled={busy || !view} onClick={() => send({ kind: 'reset', payload: { seed: Number(seed), count: { balls, strikes } } })}>設定を適用してやり直す</button>
        <p className="hint">入力値は「設定を適用」で反映されます。</p>
        <div className="count"><span>現在のカウント</span><strong>{view?.state.count.balls ?? 0}<small>B</small> — {view?.state.count.strikes ?? 0}<small>S</small></strong></div>
        <button className="primary" disabled={busy || !view || view.state.phase !== 'readyForPitch'} onClick={() => send({ kind: 'advance', payload: null })}>{busy ? '準備・計算中…' : '1球進める →'}</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
      <section className="panel pitch-view"><div className="panel-heading"><h2>投球の結果</h2><span className="muted">{pitch ? `第${pitch.eventSeq}球` : '投球前'}</span></div>
        <div aria-live="polite" className="result"><strong>{pitch ? rulingNames[pitch.ruling] : '最初の1球を投げましょう'}</strong><span>{pitch ? `${pitchNames[pitch.pitchTypeCode]} · ${(pitch.velocityCentiKph / 100).toFixed(2)} km/h` : 'ボタンを押すと計算します'}</span></div>
        <Zone pitch={pitch} /><p className="legend">＋ 狙い　 ● 実位置　 <span>{pitch?.zoneCode ?? '未観測'}</span></p>
        {pitch && <dl><div><dt>狙い (x, z)</dt><dd>{pitch.intendedLocation.xMm}, {pitch.intendedLocation.zMm} mm</dd></div><div><dt>実位置 (x, z)</dt><dd>{pitch.actualLocation.xMm}, {pitch.actualLocation.zMm} mm</dd></div></dl>}
      </section>
    </div>
    {latest?.event.stopReason && <p className="notice" role="status">{stops[latest.event.stopReason]} カウントは投球直前を保持しています。「設定を適用してやり直す」で再試行できます。</p>}
    <section className="panel history"><div className="panel-heading"><h2>投球履歴</h2><span className="muted">{view?.steps.length ?? 0}球</span></div>
      <div className="table-scroll"><table><thead><tr><th>球</th><th>投球前 B–S</th><th>球種</th><th>球速 km/h</th><th>結果</th><th>区画</th></tr></thead><tbody>
        {!view?.steps.length && <tr><td colSpan={6} className="empty">まだ投球はありません。</td></tr>}
        {view?.steps.map(step => { const p = step.event.pitch; return <tr key={p.eventSeq}><td>{p.eventSeq}</td><td>{p.countBefore.balls}–{p.countBefore.strikes}</td><td>{pitchNames[p.pitchTypeCode]}</td><td>{(p.velocityCentiKph / 100).toFixed(2)}</td><td>{rulingNames[p.ruling]}</td><td>{p.zoneCode}</td></tr>; })}
      </tbody></table></div>
    </section>
    <details className="panel"><summary>計算の検証データを見る</summary><p className="muted">確率・前後の乱数状態・モデル版を確認できます。表示操作は乱数を進めません。</p><pre>{JSON.stringify(latest ?? view?.state ?? null, null, 2)}</pre></details>
    <footer><p>pitch-prototype-v1 · 架空データ / 数式・係数は仮定</p><p>1試合の進行、公式成績、保存は未対応です。再読み込みで試行は消えます。</p></footer>
  </main>;
}
