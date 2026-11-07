import { expect, test } from '@playwright/test';

// 実行はユーザー指定により保留。空の候補一覧と画面接続の試験で、年間完走の試験ではない。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const workers: Worker[] = [];
    const commands: unknown[] = [];
    Reflect.set(window, 'candidateWorkers', workers);
    Reflect.set(window, 'candidateCommands', commands);
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('trade-world-worker')) {
          workers.push(this);
          const original = this.postMessage.bind(this);
          this.postMessage = (
            message: unknown,
            options?: StructuredSerializeOptions | Transferable[],
          ) => {
            commands.push(structuredClone(message));
            if (Array.isArray(options)) original(message, options);
            else original(message, options);
          };
        }
      }
    };
  });
  await page.goto('/?tools=1');
  await page.getByRole('button', { name: '候補プレイ', exact: true }).click();
  await expect(page.getByText('保存済み候補はありません。', { exact: false })).toBeVisible();
});

test('空の候補を捏造せず、タブを戻っても候補Workerを作り直さない', async ({ page }) => {
  await expect(page.getByRole('button', { name: '新しい候補を作成（工事中）' })).not.toBeVisible();
  await page.getByText('新規作成などの未対応機能', { exact: true }).click();
  await expect(page.getByRole('button', { name: '新しい候補を作成（工事中）' })).toBeDisabled();
  await page.getByRole('button', { name: '1試合シミュレーション', exact: true }).click();
  await page.getByRole('button', { name: '候補プレイ', exact: true }).click();
  const state = await page.evaluate(() => ({
    workers: (Reflect.get(window, 'candidateWorkers') as Worker[]).length,
    kinds: (Reflect.get(window, 'candidateCommands') as { kind: string }[]).map((r) => r.kind),
  }));
  expect(state).toEqual({ workers: 1, kinds: ['listCandidates'] });
});

test('待機中の通信停止を表示し、再接続は明示確認後だけ行う', async ({ page }) => {
  await page.evaluate(() => {
    const workers = Reflect.get(window, 'candidateWorkers') as Worker[];
    workers.at(-1)!.dispatchEvent(new Event('error'));
  });
  await expect(page.getByText('通信が停止しました。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '一覧を更新', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '新しい接続で保存一覧へ', exact: true }).click();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(
    await page.evaluate(() => (Reflect.get(window, 'candidateWorkers') as Worker[]).length),
  ).toBe(1);
  await page.getByRole('button', { name: '新しい接続で保存一覧へ', exact: true }).click();
  await page.getByRole('button', { name: '確認して実行', exact: true }).click();
  await expect(
    page.getByText('保存済みの候補一覧を読み込みました。', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (Reflect.get(window, 'candidateWorkers') as Worker[]).length),
  ).toBe(2);
});
