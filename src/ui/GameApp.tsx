import { AppInfo } from './AppInfo.tsx';
import { LoadingScreen } from './LoadingScreen.tsx';
import { lazy, Suspense, useState } from 'react';

// 通常の入口では開発用エンジン・試作データや画面を評価しない。
const WorldApp = lazy(() => import('./WorldApp.tsx').then((m) => ({ default: m.WorldApp })));
const MatchGame = lazy(() => import('./MatchGame.tsx').then((m) => ({ default: m.MatchGame })));
const PitchLab = lazy(() => import('./App.tsx').then((m) => ({ default: m.App })));
const InitialCandidates = lazy(() =>
  import('./InitialCandidatesApp.tsx').then((m) => ({ default: m.InitialCandidatesApp })),
);
const TradeCandidates = lazy(() => import('./trade-play/TradeCandidatesApp.tsx'));

export function GameApp() {
  const [toolsOpen, setToolsOpen] = useState(
    () => new URLSearchParams(location.search).get('tools') === '1',
  );
  const [tab, setTab] = useState<'game' | 'lab' | 'world' | 'candidates' | 'tradePlay'>('game');
  const [worldOpened, setWorldOpened] = useState(!toolsOpen);
  const [matchOpened, setMatchOpened] = useState(toolsOpen);
  const [tradeOpened, setTradeOpened] = useState(false);
  const [tradeAttention, setTradeAttention] = useState(false);

  function openTools() {
    setToolsOpen(true);
    if (tab === 'game') setMatchOpened(true);
  }

  return (
    <>
      {toolsOpen && (
        <>
          <nav className="app-nav" aria-label="画面切替">
            <button
              onClick={() => {
                setWorldOpened(true);
                setToolsOpen(false);
              }}
            >
              本画面へ戻る
            </button>
            <button
              aria-pressed={tab === 'world'}
              onClick={() => {
                setWorldOpened(true);
                setTab('world');
              }}
            >
              日程・球団運営
            </button>
            <button
              aria-pressed={tab === 'game'}
              onClick={() => {
                setMatchOpened(true);
                setTab('game');
              }}
            >
              1試合シミュレーション
            </button>
            <button aria-pressed={tab === 'lab'} onClick={() => setTab('lab')}>
              1球の検証
            </button>
            <button aria-pressed={tab === 'candidates'} onClick={() => setTab('candidates')}>
              初期データ候補
            </button>
            <button
              aria-pressed={tab === 'tradePlay'}
              onClick={() => {
                setTradeOpened(true);
                setTab('tradePlay');
              }}
            >
              候補プレイ{tradeAttention ? '（保存確認）' : ''}
            </button>
          </nav>
          <AppInfo />
        </>
      )}
      {matchOpened && (
        <div hidden={!toolsOpen || tab !== 'game'}>
          <Suspense fallback={<LoadingScreen title="試合画面を読み込んでいます" />}>
            <MatchGame />
          </Suspense>
        </div>
      )}
      {worldOpened && (
        <div hidden={toolsOpen && tab !== 'world'}>
          <Suspense fallback={<LoadingScreen title="球団運営画面を読み込んでいます" />}>
            <WorldApp
              development={toolsOpen}
              visible={!toolsOpen || tab === 'world'}
              onOpenTools={openTools}
            />
          </Suspense>
        </div>
      )}
      {tradeOpened && (
        <div hidden={!toolsOpen || tab !== 'tradePlay'}>
          <Suspense fallback={<LoadingScreen title="候補プレイ画面を読み込んでいます" />}>
            <TradeCandidates onAttention={setTradeAttention} />
          </Suspense>
        </div>
      )}
      {toolsOpen && tab === 'lab' && (
        <Suspense fallback={<LoadingScreen title="1球の検証画面を読み込んでいます" />}>
          <PitchLab />
        </Suspense>
      )}
      {toolsOpen && tab === 'candidates' && (
        <Suspense fallback={<LoadingScreen title="初期候補画面を読み込んでいます" />}>
          <InitialCandidates />
        </Suspense>
      )}
    </>
  );
}
