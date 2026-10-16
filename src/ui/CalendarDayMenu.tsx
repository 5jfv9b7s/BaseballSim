import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** 日付セルに付随する非モーダルの操作。画面外や固定メニューへはみ出さない。 */
export function CalendarDayMenu({
  id,
  anchor,
  date,
  onClose,
  children,
}: {
  id: string;
  anchor: HTMLButtonElement;
  date: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    const element = menu.current!;
    function place() {
      const rect = anchor.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const nav = document.querySelector('.main-navigation')?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight - 12, nav ? nav.top - 12 : Infinity);
      const below = rect.bottom + 8;
      const top = below + box.height <= bottom ? below : rect.top - box.height - 8;
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(top, bottom - box.height)),
      });
    }
    function dismiss(event: Event) {
      if (
        event.target instanceof Node &&
        !element.contains(event.target) &&
        !anchor.contains(event.target)
      ) {
        close.current();
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close.current();
      anchor.focus({ preventScroll: true });
    }
    place();
    element
      .querySelector<HTMLButtonElement>('[data-primary]:not(:disabled)')
      ?.focus({ preventScroll: true });
    if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [anchor, date]);

  return (
    <div
      ref={menu}
      id={id}
      className="calendar-day-menu"
      role="dialog"
      aria-label="選択日の操作"
      tabIndex={-1}
      style={
        {
          '--day-menu-left': position.left + 'px',
          '--day-menu-top': position.top + 'px',
        } as CSSProperties
      }
    >
      <div className="calendar-menu-heading">
        <strong>選択日：{date}</strong>
        <button
          type="button"
          className="secondary"
          aria-label="日付メニューを閉じる"
          onClick={() => {
            onClose();
            anchor.focus({ preventScroll: true });
          }}
        >
          ×
        </button>
      </div>
      {children}
    </div>
  );
}
