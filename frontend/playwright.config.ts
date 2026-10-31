import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: '../backend/.venv/bin/python ../scripts/e2e_server.py',
      url: 'http://127.0.0.1:8001/api/health',
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'API_PROXY_TARGET=http://127.0.0.1:8001 npm run dev -- --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
