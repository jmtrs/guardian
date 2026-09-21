import path from 'node:path';

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:6006',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm storybook:web',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
