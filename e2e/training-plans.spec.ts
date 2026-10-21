import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';

test.setTimeout(120000);

async function observe(page: Page, mode: 'current' | 'legacy' | 'failOnce' = 'current') {
  await page.addInitScript((mode) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'trainingCommands', []);
    window.Worker = class extends NativeWorker {
      private lastResponse: any;
      private failOnce = mode === 'failOnce';
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            // 旧版のケースだけ表示用応答を投影する。実旧保存の復元はNodeで検証。
            if (mode === 'legacy') {
              event.data.view.growth = null;
              event.data.view.training = null;
              event.data.view.definitions.version = 'world-definitions-v19';
              delete event.data.view.definitions.trainingPlans;
            }
            this.lastResponse = event.data;
            Reflect.set(window, 'trainingView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'trainingCommands').push(structuredClone(message));
        if (message?.kind === 'setTrainingPlans' && this.failOnce) {
          this.failOnce = false;
          // UIの保存失敗応答を一度だけ模擬。DBの原子的回復はNodeで実検証。
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { ...this.lastResponse, ok: false, error: '練習設定の保存失敗（試験）' },
                }),
              ),
            0,
          );
          return;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, mode);
  await page.goto('/');
  // Worker/保存領域の初期化完了を待つ。機能操作の検査とは待機境界を分ける。
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
const read = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'trainingView')) as Promise<WorldView>;
const commands = (page: Page) =>
  page.evaluate(() => Reflect.get(window, 'trainingCommands')) as Promise<unknown[]>;
async function openTraining(page: Page) {
  await page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'チーム', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'サブメニュー', exact: true })
    .getByRole('button', { name: '育成・練習', exact: true })
    .click();
}
const home = (page: Page) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name: 'ホーム', exact: true })
    .click();

for (const width of [1280, 390, 320]) {
  test(`練習：個別・混在一括・離脱保存と不変 (${width}px)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observe(page);
    const before = await read(page);
    const [first, second] = before.definitions.squads[0]!.players;
    const name = (p: NonNullable<typeof first>) => `${p.familyName} ${p.givenName}`;
    await openTraining(page);
    const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
    const detail = panel.getByRole('region', { name: '選択選手の練習内容', exact: true });
    const roster = panel.getByRole('table', { name: '練習選手一覧', exact: true });
    await expect(roster.locator('tbody tr')).toHaveCount(30);
    await expect(panel).toContainText('全試合終了後の日次確定で通常練習を実施します');
    await panel.getByRole('combobox', { name: '練習の登録区分', exact: true }).selectOption('farm');
    const farmCount = before.playerStatuses.filter(
      (p) => p.clubId === before.definitions.squads[0]!.team.clubId && p.registration === 'farm',
    ).length;
    await expect(roster.locator('tbody tr')).toHaveCount(farmCount);
    await panel.getByRole('combobox', { name: '練習の登録区分', exact: true }).selectOption('all');
    await detail
      .getByRole('combobox', { name: '練習対象', exact: true })
      .selectOption({ label: 'ミート全体（左右）' });
    await detail.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('hard');
    await detail
      .getByRole('combobox', { name: '疲労による自動調整', exact: true })
      .selectOption('false');
    await expect(
      detail.getByRole('table', { name: '練習対象の現在能力', exact: true }).locator('tbody tr'),
    ).toHaveCount(2);
    await panel.getByRole('checkbox', { name: `${name(second!)}を一括選択`, exact: true }).check();
    await expect(detail.getByRole('combobox', { name: '練習対象', exact: true })).toHaveValue('');
    await expect(detail.getByRole('combobox', { name: '練習強度', exact: true })).toHaveValue('');
    await expect(detail).toContainText('操作した項目だけ');
    await detail.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('light');
    expect(await read(page)).toEqual(before);
    expect(await commands(page)).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `.tmp/training-qa/mixed-${width}.png`, fullPage: true });
    await home(page);
    await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
    const saved = await read(page);
    expect(saved.training!.revision).toBe(1);
    expect(saved.training!.plans[first!.playerId]).toMatchObject({
      target: { kind: 'group', groupId: 'contact' },
      intensity: 'light',
      autoAdjustForFatigue: false,
    });
    expect(saved.training!.plans[second!.playerId]).toMatchObject({
      target: { kind: 'group', groupId: 'balanced' },
      intensity: 'light',
      autoAdjustForFatigue: true,
    });
    expect(saved.currentDate).toBe(before.currentDate);
    expect(saved.games).toEqual(before.games);
    expect(saved.stats).toEqual(before.stats);
    expect(saved.physical).toEqual(before.physical);
    expect(saved.definitions).toEqual(before.definitions);
    expect(await commands(page)).toHaveLength(1);
    await openTraining(page);
    await detail.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('rest');
    await panel.getByRole('button', { name: '変更を取り消す', exact: true }).click();
    await expect(detail.getByRole('combobox', { name: '練習強度', exact: true })).toHaveValue(
      'light',
    );
    expect(await commands(page)).toHaveLength(1);
    if (width === 1280) {
      await home(page);
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
      await expect(
        page.getByText('保存した世界を読み込みました。進行は停止しています。', { exact: true }),
      ).toBeVisible();
      expect((await read(page)).training).toEqual(saved.training);
      await openTraining(page);
      await expect(detail.getByRole('combobox', { name: '練習強度', exact: true })).toHaveValue(
        'light',
      );
    }
    expect(errors).toEqual([]);
  });
}

test('練習：本人の球種・守備習熟と選手詳細を表示し、閲覧/未変更離脱は指示を送らない', async ({
  page,
}) => {
  await observe(page);
  const before = await read(page);
  await openTraining(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  const detail = panel.getByRole('region', { name: '選択選手の練習内容', exact: true });
  await panel
    .getByRole('combobox', { name: '練習の選手種別', exact: true })
    .selectOption('pitcher');
  const roster = panel.getByRole('table', { name: '練習選手一覧', exact: true });
  const pitcherId = before.definitions.squads[0]!.pitches[0]!.playerId;
  const pitcher = before.definitions.squads[0]!.players.find((p) => p.playerId === pitcherId)!;
  await roster
    .getByRole('button', { name: `${pitcher.familyName} ${pitcher.givenName}`, exact: true })
    .click();
  const target = detail.getByRole('combobox', { name: '練習対象', exact: true });
  const pitchValue = await target
    .locator('option')
    .evaluateAll(
      (options) =>
        (options as HTMLOptionElement[]).find((o) => o.textContent?.includes('制球'))!.value,
    );
  const pitchLabels = await target.locator('option').allTextContents();
  for (const pitch of before.definitions.squads[0]!.pitches.filter((p) => p.playerId === pitcherId))
    expect(pitchLabels.some((label) => label.includes(pitch.pitchId))).toBe(false);
  await target.selectOption(pitchValue);
  await expect(
    detail.getByRole('table', { name: '練習対象の現在能力', exact: true }).locator('tbody tr'),
  ).toHaveCount(1);
  await target.selectOption({ label: 'SSの守備習熟' });
  await expect(
    detail.getByRole('table', { name: '練習対象の現在能力', exact: true }),
  ).toContainText('SSの守備習熟');
  await detail.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: '変更を取り消す', exact: true }).click();
  await home(page);
  expect(await commands(page)).toHaveLength(0);
  expect(await read(page)).toEqual(before);
});

test('練習：保存失敗の応答では画面/draftを保ち、再試行後に移動する', async ({ page }) => {
  await observe(page, 'failOnce');
  const before = await read(page);
  await openTraining(page);
  const detail = page.getByRole('region', { name: '選択選手の練習内容', exact: true });
  await detail.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('hard');
  await home(page);
  await expect(page.getByText('練習設定の保存失敗（試験）', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '育成・練習', exact: true })).toBeVisible();
  await expect(detail.getByRole('combobox', { name: '練習強度', exact: true })).toHaveValue('hard');
  expect((await read(page)).training).toEqual(before.training);
  await home(page);
  await expect(page.getByRole('heading', { name: 'クラブハウス', exact: true })).toBeVisible();
  expect((await read(page)).training!.revision).toBe(1);
  expect(await commands(page)).toHaveLength(2);
});

test('練習：旧保存相当の表示に練習設定を後付けしない', async ({ page }) => {
  await observe(page, 'legacy');
  const before = await read(page);
  await openTraining(page);
  await expect(
    page.getByText('この保存には練習設定の記録がありません。', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: '練習対象', exact: true })).toHaveCount(0);
  await home(page);
  expect(await commands(page)).toHaveLength(0);
  expect(await read(page)).toEqual(before);
});

test('練習と編成：退出保存から編成編集へ入り、編成保存後も練習指定を保つ', async ({ page }) => {
  test.setTimeout(120000);
  await observe(page);
  await openTraining(page);
  await page.getByRole('combobox', { name: '練習強度', exact: true }).selectOption('rest');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  const editor = page.getByRole('region', { name: '編成の編集', exact: true });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('button', { name: '編成の編集を開始', exact: true })).toHaveCount(0);
  const slots = editor.locator('.formation-slot');
  await slots.nth(0).locator('.formation-select').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await nav.getByRole('button', { name: 'チーム', exact: true }).click();
  await expect(
    page.getByRole('table', { name: '選手プロフィール一覧', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '育成・練習', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '練習強度', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: '練習強度', exact: true })).toHaveValue('rest');
  const sent = (await commands(page)) as { kind: string }[];
  expect(sent.map((command) => command.kind)).toEqual(['setTrainingPlans', 'setFormation']);
});
