import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { WorkProgress } from '../world/work-progress.ts';
import './loading.css';

/** 不明な進捗は回転表示、分かる件数だけ実数で表示する。 */
export function LoadingScreen({
  title = '画面を読み込んでいます',
  detail = '準備ができるまでお待ちください。',
  fullPage = true,
  announce = true,
  progress,
}: {
  title?: string;
  detail?: string;
  fullPage?: boolean;
  announce?: boolean;
  progress?: WorkProgress | null;
}) {
  const counted = progress?.total !== undefined && progress.completed !== undefined;
  return (
    <div
      className="loading-screen"
      data-full-page={fullPage}
      role={announce ? 'status' : undefined}
    >
      <div className="loading-content">
        <span className="loading-brand" aria-hidden="true">
          BS
        </span>
        <p className="loading-title">{title}</p>
        {counted ? (
          <>
            <progress
              value={progress.completed}
              max={progress.total}
              aria-label={progress.message}
            />
            <p className="loading-count">
              {progress.completed} / {progress.total} ブロック
            </p>
          </>
        ) : (
          <span className="loading-spinner" aria-hidden="true" />
        )}
        <p className="loading-detail" aria-live="polite" aria-atomic="true">
          {progress?.message ?? detail}
        </p>
      </div>
    </div>
  );
}

/** 非表示の祖先や遅延読込に隠されないよう、body直下で直ちに開く。 */
export function LoadingOverlay({
  active,
  title,
  progress,
}: {
  active: boolean;
  title: string;
  progress?: WorkProgress | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!active || !element) return;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
    };
  }, [active]);

  return createPortal(
    <dialog
      className="loading-dialog"
      ref={dialog}
      aria-labelledby={labelId}
      onCancel={(event) => event.preventDefault()}
    >
      <span id={labelId} className="loading-sr-only">
        {title}
      </span>
      <LoadingScreen
        title={title}
        detail="完了まで、この画面を開いたままお待ちください。"
        fullPage={false}
        announce={false}
        progress={progress}
      />
    </dialog>,
    document.body,
  );
}
