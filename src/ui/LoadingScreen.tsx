import { useEffect, useId, useRef } from 'react';
import './loading.css';

/** 進捗率が分からない処理に、架空の%や待ち時間を付けない。 */
export function LoadingScreen({
  title = '画面を読み込んでいます',
  detail = '準備ができるまでお待ちください。',
  fullPage = true,
  announce = true,
}: {
  title?: string;
  detail?: string;
  fullPage?: boolean;
  announce?: boolean;
}) {
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
        <progress aria-label="処理中" />
        <p className="loading-detail">{detail}</p>
      </div>
    </div>
  );
}

/** 短い処理では点滅させない。進行中の停止ボタンを覆う用途には使わない。 */
export function LoadingOverlay({ active, title }: { active: boolean; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      if (dialog.current?.isConnected && !dialog.current.open) dialog.current.showModal();
    }, 240);
    return () => {
      clearTimeout(timer);
      dialog.current?.close();
    };
  }, [active]);

  return (
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
      />
    </dialog>
  );
}
