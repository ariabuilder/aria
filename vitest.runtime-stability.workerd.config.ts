import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./aria/tests/runtime-stability/wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["aria/tests/runtime-stability/*.workerd.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    maxWorkers: 1,
  },
});
