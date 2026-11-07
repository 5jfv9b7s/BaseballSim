/** 描画を一度ブラウザーへ渡す。ゲームの時計・乱数・計算順序には使用しない。 */
export function paintBeforeWork(): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
      resolve();
    };
    // 背面タブではrequestAnimationFrameが停止しても要求を滞留させない。
    const fallback = setTimeout(done, 100);
    const frame = requestAnimationFrame(() => setTimeout(done, 0));
  });
}
