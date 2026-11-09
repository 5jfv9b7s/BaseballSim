import { expect, test, type Page } from '@playwright/test';
import { createCalendarRestWorld } from '../tests/calendar-progress-fixture.ts';
import { WorldController, type WorldView } from '../src/world/controller.ts';
import { completeDay } from '../src/world/engine.ts';
import { emptyWorldSlots, type WorldStorageAdapter } from '../src/world/storage.ts';
import { createNewPlayOptions } from '../src/data/world/new-play-options.ts';
import { setProgressDate } from './period-controls.ts';

/** UIの要求順だけを確認。DBの原子性と復元はNode確認で扱い、試合は計算しない。 */
async function mockRestDays(page: Page, mode: 'saveFailure' | 'pause' | 'dayFailure') {
  const slots = emptyWorldSlots();
  const storage: WorldStorageAdapter = {
    async listSlots() {
      return slots;
    },
    async load() {
      throw new Error('未使用');
    },
    async save() {
      return slots;
    },
  };
  let world = createCalendarRestWorld();
  const views: WorldView[] = [];
  for (let day = 0; day < 3; day++) {
    const owner = WorldController.fromCommitted(storage, 'calendar-ui', day + 1, world, slots);
    views.push({ ...owner.query(), unsavedChanges: day > 0 });
    if (day < 2) world = completeDay(world, world.currentDate) as typeof world;
  }
  const payload = { views, mode, newPlayOptions: createNewPlayOptions() };
  await page.addInitScript(({ views, mode, newPlayOptions }) => {
    Reflect.set(window, 'calendarCommands', []);
    Reflect.set(window, 'releaseCalendarDay', false);
    const NativeWorker = Worker;
    const makeWorldWorker = () => {
      const instance = new EventTarget() as EventTarget & {
        onmessage: ((event: MessageEvent) => void) | null;
        postMessage: (request: { kind: string; date?: string }) => void;
        terminate: () => void;
      };
      let index = 0;
      let terminated = false;
      let failed = false;
      let view = views[0]!;
      instance.onmessage = null;
      instance.terminate = () => {
        terminated = true;
      };
      instance.postMessage = (request) => {
        Reflect.get(window, 'calendarCommands').push(request);
        const reply = () => {
          if (terminated) return;
          let error = '';
          if (request.kind === 'completeDay') {
            if (mode === 'dayFailure' && index === 1) error = '日次更新の確認用エラー';
            else view = views[++index]!;
          }
          if (request.kind === 'saveProgress') {
            if (mode === 'saveFailure' && !failed) {
              failed = true;
              error = '保存の確認用エラー';
            } else view = { ...view, revision: view.revision + 1, unsavedChanges: false };
          }
          const event = new MessageEvent('message', {
            data: {
              ok: !error,
              ...(error ? { error } : {}),
              view,
              plays: [],
              newPlayOptions,
            },
          });
          instance.dispatchEvent(event);
          instance.onmessage?.(event);
        };
        if (mode === 'pause' && request.kind === 'completeDay') {
          // 明示的に解放するまで応答しない。停止操作と応答の順序を再現する。
          const timer = setInterval(() => {
            if (terminated) clearInterval(timer);
            else if (Reflect.get(window, 'releaseCalendarDay')) {
              clearInterval(timer);
              reply();
            }
          }, 20);
        } else setTimeout(reply, 0);
      };
      return instance;
    };
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (String(url).includes('world-worker')) return makeWorldWorker() as unknown as Worker;
        super(url, options);
      }
    };
  }, payload);
  await page.goto('/?tools=1');
  await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  await expect(page.getByRole('button', { name: '1日を自動進行', exact: true })).toBeEnabled({
    timeout: 45000,
  });
  await setProgressDate(page, '2026-09-25');
}

async function commands(page: Page) {
  return page.evaluate(
    () =>
      Reflect.get(window, 'calendarCommands') as { kind: string; save?: string; date?: string }[],
  );
}

test('日程の保存：途中日には保存せず、最後の保存失敗を保存だけで再試行できる', async ({ page }) => {
  await mockRestDays(page, 'saveFailure');
  await page.getByRole('button', { name: '指定日の終了まで進行', exact: true }).click();
  const retry = page.getByRole('button', { name: '進行結果の保存を再試行', exact: true });
  await expect(retry).toBeEnabled();
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-26');
  const before = await commands(page);
  expect(before.filter((c) => c.kind !== 'query')).toEqual([
    expect.objectContaining({ kind: 'completeDay', date: '2026-09-24', save: 'defer' }),
    expect.objectContaining({ kind: 'completeDay', date: '2026-09-25', save: 'defer' }),
    expect.objectContaining({ kind: 'saveProgress' }),
  ]);
  await expect(page.getByRole('button', { name: '1日を自動進行', exact: true })).toBeDisabled();
  await retry.click();
  await expect(page.getByRole('status')).toContainText('進行結果を自動保存しました');
  await expect(retry).toHaveCount(0);
  expect((await commands(page)).slice(before.length)).toEqual([
    expect.objectContaining({ kind: 'saveProgress' }),
  ]);
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-26');
});

test('日程の一時停止：応答を待ち、途中状態を1回保存してから停止する', async ({ page }) => {
  await mockRestDays(page, 'pause');
  await page.getByRole('button', { name: '指定日の終了まで進行', exact: true }).click();
  await expect
    .poll(async () => (await commands(page)).filter((c) => c.kind === 'completeDay').length)
    .toBe(1);
  await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
  expect((await commands(page)).filter((c) => c.kind === 'saveProgress')).toHaveLength(0);
  await page.evaluate(() => Reflect.set(window, 'releaseCalendarDay', true));
  await expect(page.getByRole('status')).toContainText('途中の状態を自動保存しました');
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25');
  await expect(page.getByRole('button', { name: '期間進行を再開', exact: true })).toBeEnabled();
  expect((await commands(page)).filter((c) => c.kind !== 'query').map((c) => c.kind)).toEqual([
    'completeDay',
    'saveProgress',
  ]);
  await expect(page.locator('.loading-dialog')).not.toBeVisible();
});

test('日程の日次エラー：完了済みの日までを保存し、エラーを残して次の日を進めない', async ({
  page,
}) => {
  await mockRestDays(page, 'dayFailure');
  await page.getByRole('button', { name: '指定日の終了まで進行', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('途中の状態を自動保存しました');
  await expect(page.getByRole('alert')).toContainText('日次更新の確認用エラー');
  await expect(page.getByRole('button', { name: '期間進行を再開', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('world-date')).toHaveText('2026-09-25');
  expect((await commands(page)).filter((c) => c.kind !== 'query').map((c) => c.kind)).toEqual([
    'completeDay',
    'completeDay',
    'saveProgress',
  ]);
});
