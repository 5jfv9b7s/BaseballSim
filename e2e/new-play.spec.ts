import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByRole('button', { name: '新規プレイ', exact: true }).click();
  await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
}

async function saves(page: Page) {
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: 'システム', exact: true }).click();
  await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
  return page.getByRole('region', { name: '世界の保存', exact: true });
}

for (const width of [1280, 390]) {
  test(
    '新規プレイ：初回保存・ホーム遷移・再読込後の独立再開 (' + width + 'px)',
    async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
      const seed = page.getByRole('textbox', { name: '世界seed', exact: true });
      const create = page.getByRole('button', { name: '新しい日程を準備', exact: true });

      await setup(page);
      await seed.fill('111');
      await create.click();
      await expect(page.getByRole('status')).toContainText('初回保存が完了', { timeout: 30000 });
      await expect(nav.getByRole('button', { name: 'ホーム', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      let panel = await saves(page);
      await expect(panel).toContainText('現在の作業状態は保存済み');
      await expect(
        panel.getByRole('button', { name: '自動保存を読み込む', exact: true }),
      ).toBeEnabled();
      await expect(
        panel.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeDisabled();
      const plays = panel.getByRole('combobox', { name: '保存済みプレイ', exact: true });
      const first = await plays.locator('option').nth(1).getAttribute('value');
      expect(first).toMatch(/^play-/);
      await panel.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 30000,
      });

      await setup(page);
      await seed.fill('222');
      await create.click();
      await expect(page.getByRole('status')).toContainText('初回保存が完了', { timeout: 30000 });
      panel = await saves(page);
      await expect(plays.locator('option')).toHaveCount(3);
      const ids = await plays
        .locator('option')
        .evaluateAll((options) =>
          options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
        );
      const second = ids.find((id) => id !== first)!;
      expect(second).toMatch(/^play-/);
      await expect(
        panel.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeDisabled();

      await page.reload();
      panel = await saves(page);
      await expect(plays.locator('option')).toHaveCount(3);
      for (const [id, slot, expectedSeed] of [
        [first!, 'manual', '111'],
        [second, 'auto', '222'],
      ]) {
        await plays.selectOption(id!);
        await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption(slot!);
        await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
          timeout: 30000,
        });
        await setup(page);
        await expect(seed).toHaveValue(expectedSeed!);
        panel = await saves(page);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: '.tmp/new-play-qa/saves-' + width + '.png', fullPage: true });
      expect(errors).toEqual([]);
    },
  );
}

test('新規プレイ：未保存の途中経過は作成画面の手動保存を経て保持する', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'メインメニュー', exact: true });
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  await page.getByRole('button', { name: '今日の進行', exact: true }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await page.getByRole('button', { name: '日次進行を一時停止', exact: true }).click();
  await setup(page);
  const create = page.getByRole('button', { name: '新しい日程を準備', exact: true });
  await expect(create).toBeDisabled();
  await expect(
    page.getByText('未保存の変更があります。新規作成の前に現在の作業を保存してください。', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: '現在の作業を手動保存', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 30000 });
  await expect(create).toBeEnabled();
  await page.getByRole('textbox', { name: '世界seed', exact: true }).fill('333');
  await create.click();
  await expect(page.getByRole('status')).toContainText('初回保存が完了', { timeout: 30000 });
  const panel = await saves(page);
  await panel
    .getByRole('combobox', { name: '保存済みプレイ', exact: true })
    .selectOption('v02-local');
  await panel.getByRole('combobox', { name: '開く保存枠', exact: true }).selectOption('manual');
  await panel.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 30000,
  });
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  await page.getByRole('button', { name: '今日の進行', exact: true }).click();
  await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
    /進行中（[1-9][0-9]*球）/,
  );

  await page.reload();
  await expect(page.getByRole('alert')).toContainText('以前の保存があります');
  const restarted = await saves(page);
  await expect(
    restarted.getByRole('button', { name: '世界を手動保存', exact: true }),
  ).toBeDisabled();
  await expect(restarted.locator('#manual-save-hint')).toContainText('以前の保存があります');
  await restarted.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('保存した世界を読み込みました', {
    timeout: 30000,
  });
  await nav.getByRole('button', { name: '日程', exact: true }).click();
  await page.getByRole('button', { name: '今日の進行', exact: true }).click();
  await expect(page.getByRole('region', { name: '日次進行', exact: true })).toContainText(
    /進行中（[1-9][0-9]*球）/,
  );
});
