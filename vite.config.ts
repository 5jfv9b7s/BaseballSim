import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // ローカル資料・ブラウザーの一時プロファイル・検査出力を監視しない。
      // src/やconfig/の変更検知は維持する。
      ignored: ['**/Docs/**', '**/.tmp/**', '**/playwright-report/**'],
    },
  },
  optimizeDeps: {
    // Workerから使う依存も先に準備し、初回の世界読込中の追加最適化・再読込を防ぐ。
    include: ['dexie'],
  },
});
