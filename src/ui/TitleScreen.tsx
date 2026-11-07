import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppInfo } from './AppInfo.tsx';
import { APP_VERSION } from './release-notes.ts';
import type { StoredPlay } from '../world/storage.ts';
import './interface-tokens.css';
import './title-screen.css';

type TitlePage = 'start' | 'continue' | 'new' | 'import' | 'help';

/** 表示だけを管理する。復元・作成・取り込みは既存のWorkerへ委ねる。 */
export function TitleScreen({
  plays,
  playListUnavailable,
  loading,
  disabled,
  error,
  notice,
  importedId,
  picker,
  setup,
  onImport,
  onRefresh,
  onReturnToGame,
}: {
  plays: StoredPlay[];
  playListUnavailable: boolean;
  loading: boolean;
  disabled: boolean;
  error: string;
  notice: ReactNode;
  importedId: string;
  picker: ReactNode;
  setup: ReactNode;
  onImport: (file: File) => void;
  onRefresh: () => void;
  onReturnToGame?: () => void;
}) {
  const [page, setPage] = useState<TitlePage>('start');
  const [file, setFile] = useState<File | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const imported = useRef(importedId);
  const playCount = plays.length;
  const hasPlays = playCount > 0;
  const onlyPlay = playCount === 1 ? plays[0] : undefined;

  useEffect(() => {
    if (page === 'start' && !loading) primary.current?.focus();
    else heading.current?.focus();
  }, [page, loading]);

  useEffect(() => {
    if (importedId && importedId !== imported.current) setPage('continue');
    imported.current = importedId;
  }, [importedId]);

  const titles: Record<TitlePage, string> = {
    start: 'BASEBALL SIMULATOR',
    continue: '続きから',
    new: 'はじめから',
    import: 'セーブファイルを取り込む',
    help: '設定・ヘルプ',
  };

  return (
    <div className="title-shell">
      <main className="title-screen" aria-busy={disabled}>
        <header className="title-brand">
          <div>
            <b aria-hidden="true">BS</b>
            <span>BASEBALL SIMULATOR</span>
          </div>
          <span className="title-development">開発中</span>
        </header>
        <h1 ref={heading} tabIndex={-1} className={page === 'start' ? 'title-sr-only' : ''}>
          {titles[page]}
        </h1>
        {error && (
          <p className="title-error" role="alert">
            {error}
          </p>
        )}
        {notice}
        {page === 'start' ? (
          <>
            <section className="title-hero" aria-label="ゲームの開始">
              <p className="title-eyebrow">
                {hasPlays ? 'YOUR NEXT SEASON MOMENT' : 'WELCOME TO THE CLUBHOUSE'}
              </p>
              <h2>{hasPlays ? 'シーズンの続きを、ここから。' : '球団を選んで始めよう。'}</h2>
              <p className="title-intro">
                {loading
                  ? '保存を確認しています。'
                  : hasPlays
                    ? `保存済み ${playCount}プレイ・プレイと保存時点を選んで再開できます。`
                    : '編成を整え、1シーズンを戦い抜く。'}
              </p>
              <button
                ref={primary}
                className="title-primary"
                disabled={disabled}
                onClick={() => setPage(hasPlays ? 'continue' : 'new')}
              >
                <span>{hasPlays ? '続きから' : 'はじめから'}</span>
                <span aria-hidden="true">→</span>
              </button>
              {onlyPlay && (
                <dl className="title-save-preview" aria-label="保存プレイの要約">
                  <div>
                    <dt>プレイ名</dt>
                    <dd title={onlyPlay.label}>{onlyPlay.label}</dd>
                  </div>
                  <div>
                    <dt>ゲーム内日付</dt>
                    <dd>
                      {onlyPlay.gameDate ? (
                        <time dateTime={onlyPlay.gameDate}>{onlyPlay.gameDate}</time>
                      ) : (
                        '日付未取得'
                      )}
                    </dd>
                  </div>
                </dl>
              )}
              {onReturnToGame && (
                <button className="title-current" disabled={disabled} onClick={onReturnToGame}>
                  開いているプレイへ戻る
                </button>
              )}
            </section>
            <div className="title-actions">
              <button
                disabled={disabled || !hasPlays}
                aria-describedby="title-secondary-hint"
                onClick={() => setPage(hasPlays ? 'new' : 'continue')}
              >
                <strong>{hasPlays ? 'はじめから' : '続きから'}</strong>
                <span id="title-secondary-hint">
                  {hasPlays
                    ? '今の保存を残して、新しいプレイを作成。'
                    : loading
                      ? '保存一覧を確認しています。'
                      : playListUnavailable
                        ? '保存一覧を取得できません。一覧を更新してください。'
                        : '保存されたプレイはまだありません。'}
                </span>
              </button>
              <button disabled={disabled} onClick={() => setPage('import')}>
                <strong>セーブファイルを取り込む</strong>
                <span>既存の保存を残して、別プレイとして追加。</span>
              </button>
            </div>
            <button className="title-help" disabled={disabled} onClick={() => setPage('help')}>
              設定・ヘルプ
            </button>
          </>
        ) : (
          <>
            <button className="title-back" disabled={disabled} onClick={() => setPage('start')}>
              ← タイトルへ戻る
            </button>
            {page === 'continue' && (
              <div className="title-content">
                {onReturnToGame && (
                  <button className="title-outline" disabled={disabled} onClick={onReturnToGame}>
                    開いているプレイへ戻る
                  </button>
                )}
                {picker}
                <p className="title-caption">
                  ゲーム内日付と保存枠を確認してから再開してください。保存内容の検査に成功するとホームを開きます。
                </p>
              </div>
            )}
            {page === 'new' && <div className="title-content">{setup}</div>}
            {page === 'import' && (
              <section className="title-content" aria-label="保存ファイルの取り込み">
                <p>
                  検査したファイルを新しい独立プレイとして追加します。既存の保存は上書きしません。
                </p>
                <label>
                  取り込む保存ファイル
                  <input
                    type="file"
                    accept=".bssave,application/zip"
                    disabled={disabled}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p id="title-import-hint" className="title-caption">
                  {file ? file.name : '先に .bssave ファイルを選択してください。'}
                </p>
                <button
                  className="title-primary"
                  disabled={disabled || !file}
                  aria-describedby="title-import-hint"
                  onClick={() => file && onImport(file)}
                >
                  別プレイとして取り込む
                </button>
              </section>
            )}
            {page === 'help' && (
              <section className="title-content" aria-label="タイトルの利用案内">
                <h2>遊び方</h2>
                <p>
                  「はじめから」で球団と日程を確認し、初回保存後にホームへ進みます。「続きから」ではプレイと保存時点を選びます。
                </p>
                <p>
                  ホームの「今日の試合へ」から試合を進められます。画面を見るだけでは日付は進みません。
                </p>
                <p>
                  保存はこのブラウザ内にあります。別の端末への引き継ぎには「システム」のファイル書き出し・取り込みを使ってください。
                </p>
                <button className="title-outline" disabled aria-describedby="title-settings-hint">
                  設定（工事中）
                </button>
                <p id="title-settings-hint" className="title-caption">
                  共通の表示・音量設定は未実装です。
                </p>
                <AppInfo />
              </section>
            )}
          </>
        )}
        <footer className="title-footer">
          <span>開発版 {APP_VERSION}・架空リーグ（試作）</span>
          <button disabled={disabled} onClick={onRefresh}>
            保存一覧を更新
          </button>
        </footer>
      </main>
    </div>
  );
}
