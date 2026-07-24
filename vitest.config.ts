import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";

const libAliases = [
  "analytics",
  "auth",
  "blocks",
  "build",
  "cache",
  "cloudflare",
  "composer",
  "content-sync",
  "design",
  "errors",
  "events",
  "export",
  "fonts",
  "ids",
  "media",
  "motion",
  "migrations",
  "pages",
  "preloader",
  "registry",
  "rendering",
  "runtime",
  "schemas",
  "security",
  "storage",
  "styles",
  "types",
  "vendor",
];

function libAliasEntries() {
  const entries: Record<string, string> = {};
  for (const sub of libAliases) {
    entries[`@/lib/${sub}`] = path.resolve(__dirname, `./aria/lib/${sub}`);
  }
  entries["@/lib/utils/logger"] = path.resolve(
    __dirname,
    "./aria/lib/utils/logger",
  );
  entries["@/lib/utils/slugify"] = path.resolve(
    __dirname,
    "./aria/lib/utils/slugify",
  );
  return entries;
}

export default defineConfig({
  plugins: [vue() as never],
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        resources: "usable",
      },
    },
    setupFiles: ["./aria/tests/setup.ts"],
    include: [
      "aria/tests/**/*.{test,spec}.{js,ts}",
      "aria/admin/features/**/*.test.ts",
    ],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Cap workers so import/transform queues don't starve under full-suite load.
    maxWorkers: 4,
    alias: {
      ...libAliasEntries(),
      "@": path.resolve(__dirname, "./aria/admin"),
      "~": path.resolve(__dirname, "./aria"),
      "cloudflare:workers": path.resolve(
        __dirname,
        "./aria/tests/mocks/cloudflare-workers.ts",
      ),
      "astro:actions": path.resolve(
        __dirname,
        "./aria/tests/mocks/astro-actions.ts",
      ),
      "@aria-email/smtp-runtime": path.resolve(
        __dirname,
        "./aria/lib/email/providers/smtp-node-runtime.ts",
      ),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["aria/**/*.{ts,vue}"],
      exclude: [
        "aria/tests/**",
        "aria/**/*.d.ts",
        "aria/**/*.config.*",
        "aria/**/index.ts",
      ],
    },
  },
  resolve: {
    alias: {
      ...libAliasEntries(),
      "@": path.resolve(__dirname, "./aria/admin"),
      "~": path.resolve(__dirname, "./aria"),
      "cloudflare:workers": path.resolve(
        __dirname,
        "./aria/tests/mocks/cloudflare-workers.ts",
      ),
      "astro:actions": path.resolve(
        __dirname,
        "./aria/tests/mocks/astro-actions.ts",
      ),
      "@aria-email/smtp-runtime": path.resolve(
        __dirname,
        "./aria/lib/email/providers/smtp-node-runtime.ts",
      ),
    },
  },
});
