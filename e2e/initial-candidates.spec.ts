import { test, expect, type Page } from '@playwright/test';
import type { InitialDataResponse } from '../src/initial-data/controller.ts';
import type { WorldView } from '../src/world/controller.ts';

async function openCandidates(page: Page) {
  await page.addInitScript(() => {
    const NativeWorker = Worker;
    Reflect.set(window, 'candidateWorldCommands', 0);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', ({ data }) => {
          if (String(url).includes('initial-data-worker')) {
            Reflect.set(window, 'candidateResponse', data);
            if (data.dataset) Reflect.set(window, 'candidateDataset', data.dataset);
          }
          if (String(url).includes('world-worker') && data.view)
            Reflect.set(window, 'candidateWorld', data.view);
        });
      }
      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          String(message) &&
          typeof message === 'object' &&
          message !== null &&
          'localWorldId' in message
        )
          Reflect.set(
            window,
            'candidateWorldCommands',
            Reflect.get(window, 'candidateWorldCommands') + 1,
          );
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
  await page.getByRole('button', { name: 'シミュレーション開発ツール ↗', exact: true }).click();
  await page
    .getByRole('navigation', { name: '画面切替', exact: true })
    .getByRole('button', { name: '初期データ候補', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: '2026年 初期データ候補', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: '候補選手', exact: true }).locator('option'),
  ).toHaveCount(70);
}

for (const width of [1280, 390, 320]) {
  test(`初期候補：70人の絞込・22能力/上限・9位置・未決定情報と画面幅 (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openCandidates(page);
    const detail = page.getByRole('region', { name: '初期候補の詳細', exact: true });
    await expect(
      detail.getByRole('table', { name: '初期候補の22能力', exact: true }).locator('tbody tr'),
    ).toHaveCount(22);
    await expect(detail.getByRole('meter')).toHaveCount(22);
    await expect(detail).toContainText('外国人枠資格：未決定');
    await detail.getByRole('button', { name: '適性・成長候補', exact: true }).click();
    await expect(
      detail.getByRole('table', { name: '初期候補の9位置', exact: true }).locator('tbody tr'),
    ).toHaveCount(9);
    await expect(detail).toContainText('成長・衰え・覚醒や適性の作用は未接続');
    await page.getByRole('combobox', { name: '候補の区分', exact: true }).selectOption('C');
    await expect(
      page.getByRole('combobox', { name: '候補選手', exact: true }).locator('option'),
    ).toHaveCount(7);
    await detail.getByRole('button', { name: '持ち球・1球検証', exact: true }).click();
    await expect(detail).toContainText('持ち球候補はありません');
    await expect(
      detail.getByRole('button', { name: 'この球種で1球検証', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('combobox', { name: '候補の区分', exact: true }).selectOption('all');
    const response = await page.evaluate(
      () =>
        Reflect.get(
          window,
          'candidateDataset',
        ) as import('../src/initial-data/types.ts').CandidateDataset,
    );
    const unresolved = response.players.find((p) => p.profile.primaryPosition === null)!;
    await page
      .getByRole('combobox', { name: '候補選手', exact: true })
      .selectOption(unresolved.playerId);
    await expect(detail).toContainText('代表位置：未決定');
    await detail.getByRole('button', { name: '22能力・上限', exact: true }).click();
    await detail.screenshot({ path: `.tmp/initial-candidates-qa/abilities-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole('textbox', { name: '名前で絞り込み', exact: true })
      .fill('該当しない候補名');
    await expect(page.getByRole('combobox', { name: '候補選手', exact: true })).toBeDisabled();
    await expect(detail).toHaveCount(0);
    await page.getByRole('textbox', { name: '名前で絞り込み', exact: true }).fill('');
    await expect(detail).toBeVisible();
    await page.getByRole('button', { name: '本画面へ戻る', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24');
    expect(await page.evaluate(() => Reflect.get(window, 'candidateWorldCommands'))).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [1280, 390]) {
  test(`初期候補：4追加球種の1球を同seedで再現し、正式世界と分離する (${width}px)`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 960 });
    await openCandidates(page);
    const dataset = await page.evaluate(
      () =>
        Reflect.get(
          window,
          'candidateDataset',
        ) as import('../src/initial-data/types.ts').CandidateDataset,
    );
    const before = await page.evaluate(() => Reflect.get(window, 'candidateWorld') as WorldView);
    const detail = page.getByRole('region', { name: '初期候補の詳細', exact: true });
    await detail.getByRole('button', { name: '持ち球・1球検証', exact: true }).click();
    for (const code of ['twoSeamer', 'shuuto', 'knuckleCurve', 'palmBall']) {
      const owner = dataset.players.find((p) =>
        p.pitchRepertoires.some((q) => q.pitchTypeCode === code),
      )!;
      const pitch = owner.pitchRepertoires.find((q) => q.pitchTypeCode === code)!;
      await page
        .getByRole('combobox', { name: '候補選手', exact: true })
        .selectOption(owner.playerId);
      await page
        .getByRole('combobox', { name: '検証する球種', exact: true })
        .selectOption(pitch.pitchId);
      await page.getByRole('textbox', { name: '検証seed', exact: true }).fill('42');
      await page.getByRole('button', { name: 'この球種で1球検証', exact: true }).click();
      const result = page.getByRole('region', { name: '候補の1球結果', exact: true });
      await expect(result).toContainText('seed 42');
      const first = await page.evaluate(
        () => Reflect.get(window, 'candidateResponse') as InitialDataResponse,
      );
      expect(first.ok && first.preview?.step.event.pitch.pitchTypeCode).toBe(code);
      expect(first.ok && first.preview?.fixture.pitches[0]!.delivery).toEqual(pitch.delivery);
      await page.getByRole('button', { name: 'この球種で1球検証', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'この球種で1球検証', exact: true }),
      ).toBeEnabled();
      const second = await page.evaluate(
        () => Reflect.get(window, 'candidateResponse') as InitialDataResponse,
      );
      expect(second).toEqual(first);
    }
    const measurements = page
      .getByRole('region', { name: '候補の1球結果', exact: true })
      .locator('dl');
    const labels = await measurements
      .locator('dt')
      .evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().top));
    expect(labels.every((top, i) => i === 0 || top > labels[i - 1]!)).toBe(true);
    await page
      .getByRole('region', { name: '候補の1球結果', exact: true })
      .screenshot({ path: `.tmp/initial-candidates-qa/pitch-${width}.png` });
    await page.getByRole('textbox', { name: '検証seed', exact: true }).fill('0');
    await expect(page.getByRole('region', { name: '候補の1球結果', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'この球種で1球検証', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('seedは1～4294967295');
    expect(await page.evaluate(() => Reflect.get(window, 'candidateWorld') as WorldView)).toEqual(
      before,
    );
    expect(await page.evaluate(() => Reflect.get(window, 'candidateWorldCommands'))).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
