import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Workerから使う依存も先に準備し、初回の世界読込中の追加最適化・再読込を防ぐ。
    include: ['dexie'],
  },
});
