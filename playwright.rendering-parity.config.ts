import { defineConfig } from "@playwright/test";

const NODE_PORT = 4381;
const WORKERD_PORT = 4382;

export default defineConfig({
  testDir: "./aria/tests/rendering-parity",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["line"]],
  use: {
    browserName: "chromium",
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "node",
      use: {
        baseURL: `http://127.0.0.1:${NODE_PORT}`,
      },
    },
    {
      name: "workerd",
      use: {
        baseURL: `http://127.0.0.1:${WORKERD_PORT}`,
      },
    },
  ],
  webServer: [
    {
      command: `node --import tsx aria/scripts/run-rendering-parity-host.ts --runtime node --port ${NODE_PORT}`,
      url: `http://127.0.0.1:${NODE_PORT}/aria-rendering-parity-public?runtime=node`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `node --import tsx aria/scripts/run-rendering-parity-host.ts --runtime workerd --port ${WORKERD_PORT}`,
      url: `http://127.0.0.1:${WORKERD_PORT}/admin/login?preview=true`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
