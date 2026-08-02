import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __ARIA_FOUNDATION_RUNTIME__: JSON.stringify("node"),
  },
  test: {
    environment: "node",
    include: [
      "aria/tests/rendering-foundation/browser-parity-contract.parity.test.ts",
      "aria/tests/rendering-foundation/foundation.parity.test.ts",
      "aria/tests/rendering-foundation/normalization.parity.test.ts",
      "aria/tests/rendering-foundation/foundation.node.test.ts",
      "aria/tests/rendering-foundation/foundation-gaps.node.test.ts",
    ],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    maxWorkers: 1,
  },
});
