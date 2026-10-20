import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// 通常のVite用UI試験とは分け、実際のWrangler/workerdから配信する。
export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 180000,
  outputDir: '../test-results/cloudflare',
  use: {
    channel: 'msedge',
    headless: true,
    baseURL: 'http://127.0.0.1:8787',
    screenshot: 'only-on-failure',
    actionTimeout: 30000,
  },
  webServer: {
    command:
      'node node_modules/wrangler/bin/wrangler.js dev --config wrangler.test.jsonc --ip 127.0.0.1 --port 8787 --local --show-interactive-dev-session=false',
    cwd: root,
    env: { WRANGLER_SEND_METRICS: 'false', BROWSER: 'none' },
    url: 'http://127.0.0.1:8787',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
