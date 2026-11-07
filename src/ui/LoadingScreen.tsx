import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_TIPS } from './loading-tips.ts';
import './loading.css';

/** 操作の途中経過を並べず、待機表示と短い野球の一言に統一する。 */
export function LoadingScreen({
  fullPage = true,
  announce = true,
}: {
  fullPage?: boolean;
  announce?: boolean;
}) {
  const [tipIndex, setTipIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setTipIndex((index) => (index + 1) % LOADING_TIPS.length),
      8000,
    );
    return () => clearInterval(timer);
  }, []);
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
        <p className="loading-title">Now Loading...</p>
        <span className="loading-spinner" aria-hidden="true" />
        <p className="loading-detail">
          <span className="loading-tip-label">ベンチのひとこと</span>
          {LOADING_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
}

/** 非表示の祖先や遅延読込に隠されないよう、body直下で直ちに開く。 */
export function LoadingOverlay({ active }: { active: boolean }) {
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
        読み込み中
      </span>
      {active && <LoadingScreen fullPage={false} announce={false} />}
    </dialog>,
    document.body,
  );
}
