import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/WireLink-Studio/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
