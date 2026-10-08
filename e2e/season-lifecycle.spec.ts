import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

// UI・Worker・実IndexedDBを通す長時間検証。試験時間は製品の性能目標ではない。
test('年間実機：途中再開・188日の日次保存・216試合・年度末バックアップ復元', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(2700000);
  const started = Date.now();
  const measurements: { stage: string; elapsedSeconds: number; detail?: unknown }[] = [];
  const errors: string[] = [];
  const record = (stage: string, detail?: unknown) => {
    const entry = { stage, elapsedSeconds: Math.round((Date.now() - started) / 1000), detail };
    measurements.push(entry);
    console.log(JSON.stringify(entry));
  };
  const observe = (target: Page) => target.on('pageerror', (error) => errors.push(error.message));
  const openWorld = async (target: Page) => {
    await target.goto(new URL('/', page.url()).href);
    await target.getByRole('button', { name: '日程・球団運営', exact: true }).click();
  };
  const stopped = async (target: Page) => {
    await expect(
      target.getByRole('button', { name: '日次進行を一時停止', exact: true }),
    ).toBeDisabled();
  };
  const waitDate = async (targetDate: string) => {
    let lastReport = Date.now();
    await expect
      .poll(
        async () => {
          const alert = page.getByRole('alert');
          if (await alert.count()) throw new Error(await alert.first().innerText());
          const date = await page.getByTestId('world-date').innerText();
          if (Date.now() - lastReport >= 30000) {
            record('進行中', date);
            lastReport = Date.now();
          }
          return date;
        },
        { timeout: 1500000, intervals: [1000] },
      )
      .toBe(targetDate);
    await stopped(page);
  };
  const standings = async (target: Page) => {
    const select = target.getByRole('combobox', { name: '表示する大会', exact: true });
    await select.selectOption('firstRegular');
    const first = await target.getByRole('region', { name: '順位表', exact: true }).innerText();
    await select.selectOption('farmRegular');
    const farm = await target.getByRole('region', { name: '順位表', exact: true }).innerText();
    await select.selectOption('firstRegular');
    return { first, farm };
  };
  const inspect = async (target: Page) => {
    const panel = target.getByRole('region', { name: '世界の保存', exact: true });
    await panel.getByText('保存容量と履歴を確認', { exact: true }).click();
    await panel.getByRole('button', { name: '保存容量を診断', exact: true }).click();
    const report = panel.getByTestId('storage-inspection');
    await expect(report).toContainText('未参照の履歴：0件', { timeout: 60000 });
    await expect(report).toContainText('未参照の共有データ：0件');
    const text = await report.innerText();
    record('保存容量', text);
    await panel.getByText('保存容量と履歴を確認', { exact: true }).click();
  };
  observe(page);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByText('新規日程・担当球団と試作の範囲', { exact: true }).click();
    await page
      .getByRole('combobox', { name: '新規プレイの日程', exact: true })
      .selectOption('annual');
    await page.getByRole('button', { name: '新しい日程を準備', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-03-27');
    await page
      .getByRole('region', { name: '日次進行', exact: true })
      .locator('input[type="date"]')
      .fill('2026-06-30');
    await page.getByRole('button', { name: '指定日まで進行', exact: true }).click();
    await waitDate('2026-07-01');
    const middle = await standings(page);
    await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('世界全体を手動保存', { timeout: 120000 });
    record('途中手動保存');
    await inspect(page);
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
    await expect(page.getByTestId('world-date')).toHaveText('2026-07-01', { timeout: 180000 });
    expect(await standings(page)).toEqual(middle);
    await stopped(page);
    record('途中再開');
    await page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }).click();
    await waitDate('2026-10-01');
    const summary = page.getByRole('region', { name: 'シーズン終了要約', exact: true });
    await expect(summary).toContainText('全144試合');
    await expect(
      page.getByRole('button', { name: 'シーズン終了まで進行', exact: true }),
    ).toBeDisabled();
    const finalStandings = await standings(page);
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('farmRegular');
    await expect(summary).toContainText('全72試合');
    await page
      .getByRole('combobox', { name: '表示する大会', exact: true })
      .selectOption('firstRegular');
    record('年間完走');
    await inspect(page);
    await page.screenshot({ path: info.outputPath('season-complete.png'), fullPage: true });
    await page.reload();
    await page.getByRole('button', { name: '日程・球団運営', exact: true }).click();
    await page.getByRole('button', { name: '自動保存を読み込む', exact: true }).click();
    await expect(summary).toContainText('全144試合', { timeout: 180000 });
    expect(await standings(page)).toEqual(finalStandings);
    await stopped(page);
    record('年度末の再読込');

    await page.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
    await page.getByRole('combobox', { name: '書き出す保存枠', exact: true }).selectOption('auto');
    const downloading = page.waitForEvent('download', { timeout: 180000 });
    await page.getByRole('button', { name: '保存ファイルを書き出す', exact: true }).click();
    const file = await downloading;
    await file.saveAs(info.outputPath('season.bssave'));
    const bytes = await readFile((await file.path())!);
    record('年度末バックアップ', { bytes: bytes.length });
    const independent = await browser.newContext({ viewport: { width: 390, height: 960 } });
    try {
      const receiver = await independent.newPage();
      observe(receiver);
      await openWorld(receiver);
      await receiver.getByText('ファイルのバックアップ・別プレイの復元', { exact: true }).click();
      await receiver
        .getByLabel('取り込む保存ファイル', { exact: true })
        .setInputFiles({ name: 'season.bssave', mimeType: 'application/zip', buffer: bytes });
      await receiver.getByRole('button', { name: '別プレイとして取り込む', exact: true }).click();
      await Promise.race([
        expect(receiver.getByRole('status')).toContainText('別プレイとして取り込みました', {
          timeout: 180000,
        }),
        receiver
          .getByRole('alert')
          .waitFor({ state: 'visible', timeout: 180000 })
          .then(async () => {
            throw new Error(await receiver.getByRole('alert').innerText());
          }),
      ]);
      record('別ブラウザへの取り込み');
      await receiver.getByRole('button', { name: '選んだプレイを開く', exact: true }).click();
      await expect(receiver.getByTestId('world-date')).toHaveText('2026-10-01', {
        timeout: 180000,
      });
      expect(await standings(receiver)).toEqual(finalStandings);
      record('別ブラウザで開く');
      await stopped(receiver);
      await receiver.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(receiver.getByRole('status')).toContainText('世界全体を手動保存', {
        timeout: 180000,
      });
      await expect(
        receiver.getByRole('region', { name: 'シーズン終了要約', exact: true }),
      ).toContainText('全144試合');
      await receiver
        .getByRole('combobox', { name: '表示する大会', exact: true })
        .selectOption('farmRegular');
      await expect(
        receiver.getByRole('region', { name: 'シーズン終了要約', exact: true }),
      ).toContainText('全72試合');
      expect(
        await receiver.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await receiver.screenshot({
        path: info.outputPath('season-restored-390.png'),
        fullPage: true,
      });
      record('別ブラウザ復元・再保存');
    } finally {
      await independent.close();
    }
    expect(errors).toEqual([]);
  } finally {
    const report = JSON.stringify({ browser: browser.version(), measurements, errors }, null, 2);
    await writeFile(info.outputPath('season-measurements.json'), report);
    await info.attach('season-measurements.json', {
      body: report,
      contentType: 'application/json',
    });
  }
});
