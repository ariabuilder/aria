import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __ARIA_FOUNDATION_RUNTIME__: JSON.stringify("workerd"),
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-06-24",
        compatibilityFlags: [],
      },
    }),
  ],
  test: {
    include: [
      "aria/tests/rendering-foundation/browser-parity-contract.parity.test.ts",
      "aria/tests/rendering-foundation/canonical-document.parity.test.ts",
      "aria/tests/rendering-foundation/description-list-semantics.parity.test.ts",
      "aria/tests/rendering-foundation/foundation.parity.test.ts",
      "aria/tests/rendering-foundation/normalization.parity.test.ts",
      "aria/tests/rendering-foundation/resolved-surface.parity.test.ts",
      "aria/tests/rendering-foundation/foundation.workerd.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    maxWorkers: 1,
  },
});
