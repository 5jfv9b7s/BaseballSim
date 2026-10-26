import { test, expect, type Page } from '@playwright/test';
import type { WorldView } from '../src/world/controller.ts';
import { growthComparison } from '../src/world/growth-view.ts';
import { growthAbilityKey } from '../src/world/growth-basis.ts';
import { commonTrainingRef } from '../src/world/training.ts';

// 3画面幅の照合と実保存/再開を含むため、Windowsの年間検証併走時にも待機できる上限。
test.setTimeout(240000);
async function observe(page: Page, legacy: boolean | 'training' | 'experience' | 'aging' = false) {
  await page.addInitScript((legacy) => {
    const NativeWorker = Worker;
    Reflect.set(window, 'growthCommands', []);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('world-worker'))
          this.addEventListener('message', (event) => {
            if (!event.data?.view) return;
            // 旧版の表示だけを投影。旧保存の実際の復元はNodeで確認する。
            if (legacy) {
              event.data.view.camp = null;
              if (event.data.view.growth) delete event.data.view.growth.campBursts;
              delete event.data.view.definitions.campConfig;
              delete event.data.view.definitions.campInputs;
              if (event.data.view.growth) delete event.data.view.growth.rookieAwakening;
              delete event.data.view.definitions.awakeningConfig;
            }
            if (legacy === 'aging') {
              event.data.view.growth.version = 'daily-development-v3';
              event.data.view.definitions.version = 'world-definitions-v23';
              event.data.view.modelVersion = 'world-prototype-v18';
            } else if (legacy === 'experience') {
              event.data.view.growth.version = 'daily-development-v2';
              if (event.data.view.growth.latest) delete event.data.view.growth.latest.aging;
              delete event.data.view.definitions.ageConfig;
              delete event.data.view.definitions.ageCurves;
              event.data.view.definitions.version = 'world-definitions-v22';
              event.data.view.modelVersion = 'world-prototype-v17';
            } else if (legacy === 'training') {
              event.data.view.growth.version = 'daily-training-v1';
              if (event.data.view.growth.latest) {
                delete event.data.view.growth.latest.experience;
                delete event.data.view.growth.latest.aging;
              }
              delete event.data.view.definitions.ageConfig;
              delete event.data.view.definitions.ageCurves;
              event.data.view.definitions.version = 'world-definitions-v21';
              delete event.data.view.definitions.experienceConfig;
              event.data.view.modelVersion = 'world-prototype-v16';
            } else if (legacy) {
              event.data.view.growth = null;
              event.data.view.definitions.version = 'world-definitions-v20';
              event.data.view.modelVersion = 'world-prototype-v15';
            }
            Reflect.set(window, 'growthView', event.data.view);
          });
      }
      override postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
        if (message?.localWorldId)
          Reflect.get(window, 'growthCommands').push(structuredClone(message));
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  }, legacy);
  await page.goto('/');
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-24', {
    timeout: 30000,
  });
}
const read = (page: Page) =>
  test.step('Workerの表示状態を取得', () =>
    page.evaluate(() => Reflect.get(window, 'growthView')) as Promise<WorldView>);
const count = (page: Page) =>
  test.step('閲覧操作の送信指示数を確認', () =>
    page.evaluate(() => Reflect.get(window, 'growthCommands').length) as Promise<number>);
const menu = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'メインメニュー', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
async function training(page: Page) {
  await menu(page, 'チーム');
  await page
    .getByRole('navigation', { name: 'サブメニュー', exact: true })
    .getByRole('button', { name: '育成・練習', exact: true })
    .click();
}

for (const width of [1280, 390, 320])
  test(`通常練習：日次の実績・現在能力・表示不変と保存復帰 (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await observe(page);
    await training(page);
    await expect(page.getByRole('region', { name: '成長履歴', exact: true })).toContainText(
      'まだ日次の練習実績がありません',
    );
    expect(await count(page)).toBe(0);
    await menu(page, 'ホーム');
    await page.getByRole('button', { name: /^今日の試合へ/ }).click();
    await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
    await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
      timeout: 60000,
    });
    const after = await read(page);
    expect(after.modelVersion).toBe('world-prototype-v20');
    expect(after.growth!.version).toBe('daily-development-v5');
    expect(after.growth!.latest!.experience!.length).toBeGreaterThan(0);
    expect(after.growth!.dates).toEqual(['2026-09-24']);
    expect(after.growth!.latest!.outcomes).toHaveLength(120);
    const g = after.growth!;
    const player = after.definitions.squads[0]!.players.find(
      (p) =>
        g.latest!.experience!.some((e) => e.playerId === p.playerId) &&
        Object.keys(g.current[p.playerId]!).some(
          (k) => g.current[p.playerId]![k] !== g.periods.season.start[p.playerId]![k],
        ),
    )!;
    expect(player).toBeTruthy();
    const id = player.playerId;
    const name = `${player.familyName} ${player.givenName}`;
    await training(page);
    const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
    await panel.getByRole('button', { name, exact: true }).click();
    const growth = panel.getByRole('region', { name: '成長履歴', exact: true });
    const comparison = growthComparison(
      after.definitions,
      id,
      g.periods.season.start[id]!,
      g.current[id]!,
    );
    const totals = growth.getByRole('definition');
    const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
    await expect(totals).toHaveText([
      signed(comparison.increase),
      String(comparison.decrease),
      signed(comparison.net),
    ]);
    const beforeCommands = await count(page);
    await growth.getByRole('combobox', { name: '集計期間', exact: true }).selectOption('lastDay');
    await growth.getByText(/^能力別の変化（/).click();
    const changes = growth.getByRole('table', { name: '能力別の成長', exact: true });
    await expect(changes.locator('tbody tr')).toHaveCount(
      comparison.rows.filter((r) => r.beforeValue !== r.afterValue).length,
    );
    await growth.getByText(/^直近の年齢変化（/).click();
    const aging = growth.locator('.age-results');
    const ageRow = g.latest!.aging!.find((row) => row.playerId === id)!;
    const number = (v: number) => (v > 0 ? '+' : '') + (v / 1000).toFixed(3).replace(/\.?0+$/, '');
    const ageTable = aging.getByRole('table', { name: '年齢変化の内訳', exact: true });
    await expect(ageTable.locator('tbody tr')).toHaveCount(3);
    for (let index = 0; index < ageRow.groups.length; index++) {
      const row = ageRow.groups[index]!;
      await expect(ageTable.locator('tbody tr').nth(index).locator('td')).toHaveText([
        number(row.increaseMilli),
        number(row.decreaseMilli),
        number(row.increaseMilli + row.decreaseMilli),
      ]);
    }
    await aging.screenshot({ path: `.tmp/age-qa/aging-${width}.png` });
    await growth.getByText(/^直近の実戦経験（/).click();
    const experience = growth.locator('.experience-results');
    const played = g.latest!.experience!.filter((e) => e.playerId === id);
    await expect(experience.locator('li')).toHaveCount(played.length);
    const labels = { batting: '打席', pitching: '球', fielding: '球分の守備参加' };
    for (const row of played)
      await expect(experience).toContainText(`${row.units}${labels[row.domain]}`);
    await growth.getByText(/^直近の練習結果（/).click();
    await expect(growth).toContainText('2026-09-24');
    await expect(growth).toContainText('体力消費');
    await expect(growth.getByRole('img')).toHaveAccessibleName(/日別の能力変化/);
    await growth.scrollIntoViewIfNeeded();
    await growth.screenshot({ path: `.tmp/age-qa/history-${width}.png` });
    expect(await count(page)).toBe(beforeCommands);
    expect(await read(page)).toEqual(after);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.getByRole('button', { name: '選手詳細を開く', exact: true }).click();
    const detail = page.getByRole('dialog');
    const key = growthAbilityKey(commonTrainingRef('batting.contactVsRight'));
    await expect(detail.getByRole('meter', { name: '対右ミート', exact: true })).toHaveAttribute(
      'value',
      String(g.current[id]![key]! / 1000),
    );
    await detail.getByRole('button', { name: '状態・成長', exact: true }).click();
    await expect(
      detail.getByRole('region', { name: '成長履歴', exact: true }).getByRole('definition'),
    ).toHaveText([
      signed(comparison.increase),
      String(comparison.decrease),
      signed(comparison.net),
    ]);
    await detail.screenshot({ path: `.tmp/age-qa/detail-${width}.png` });
    await page.keyboard.press('Escape');
    expect(await count(page)).toBe(beforeCommands);
    if (width === 1280) {
      await menu(page, 'システム');
      await page.getByRole('button', { name: '世界を手動保存', exact: true }).click();
      await expect(
        page.getByRole('button', { name: '手動保存を読み込む', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await page.reload();
      await page.getByRole('button', { name: 'セーブから再開 →', exact: true }).click();
      await page.getByRole('button', { name: '手動保存を読み込む', exact: true }).click();
      await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
        timeout: 30000,
      });
      expect((await read(page)).growth).toEqual(g);
      await training(page);
      await panel.getByRole('button', { name, exact: true }).click();
      await expect(growth).toContainText('2026-09-24');
    }
    expect(errors).toEqual([]);
  });

test('通常練習：旧v20相当の表示では成長履歴や自動調整を有効扱いしない', async ({ page }) => {
  await observe(page, true);
  await training(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  await expect(panel).toContainText('この保存は練習の指定・保存まで');
  await expect(panel).toContainText('日次成長の記録がありません');
  await expect(
    panel.getByRole('combobox', { name: '疲労による自動調整', exact: true }),
  ).toContainText('判定準備中');
  expect(await count(page)).toBe(0);
});

test('実戦経験：旧v16相当の表示は通常練習のみと明記し、未記録を経験ゼロで補わない', async ({
  page,
}) => {
  await observe(page, 'training');
  await page.getByRole('button', { name: /^今日の試合へ/ }).click();
  await page.getByRole('button', { name: '1日を自動進行', exact: true }).click();
  await expect(page.getByTestId('main-date')).toHaveAttribute('datetime', '2026-09-25', {
    timeout: 60000,
  });
  await training(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  await expect(panel).toContainText('実戦経験・加齢・覚醒・キャンプは工事中');
  await expect(panel.getByText(/^直近の練習結果（/)).toBeVisible();
  await expect(panel.getByText(/^直近の実戦経験（/)).toHaveCount(0);
});

test('年齢変化：旧v17相当の表示では年齢変化を記録済みと扱わない', async ({ page }) => {
  await observe(page, 'experience');
  await training(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  await expect(panel).toContainText('通常練習と実戦経験を反映');
  await expect(panel).toContainText('加齢・覚醒・キャンプは工事中');
  await expect(panel.locator('.age-results')).toHaveCount(0);
  expect(await count(page)).toBe(0);
});

test('旧v18の表示：年齢変化を維持し、覚醒を後付けしない', async ({ page }) => {
  await observe(page, 'aging');
  await training(page);
  const panel = page.getByRole('region', { name: '育成・練習設定', exact: true });
  await expect(panel).toContainText('通常練習・実戦経験・年齢変化を反映します');
  await expect(panel.locator('.age-results')).toHaveCount(1);
  await expect(panel.locator('.rookie-results')).toHaveCount(0);
});
