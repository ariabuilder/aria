import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const PackageDependenciesSchema = z
  .object({
    dependencies: z.record(z.string(), z.string()).optional(),
    devDependencies: z.record(z.string(), z.string()).optional(),
  })
  .loose();

async function source(relativePath: string): Promise<string> {
  return readFile(path.resolve(workspaceRoot, relativePath), "utf8");
}

describe("Rendering v2 named parity gaps", () => {
  it.fails(
    "PARITY-01 [owner Phase 9] declares the Node Playwright provider",
    async () => {
      const manifest = PackageDependenciesSchema.parse(
        JSON.parse(await source("package.json")),
      );
      expect({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      }).toHaveProperty("playwright");
    },
  );

  it.fails(
    "PARITY-01 [owner Phase 9] declares Cloudflare Browser Rendering",
    async () => {
      const wrangler = await source("wrangler.jsonc");
      expect(wrangler).toMatch(/"browser"\s*:\s*\{/u);
    },
  );

  it.fails(
    "PARITY-01 [owner Phase 9] prevents Cloudflare capture from falling through to Playwright",
    async () => {
      const thumbnailServer = await source(
        "aria/lib/rendering/pageThumbnailServer.ts",
      );
      expect(thumbnailServer).not.toContain('dynamicImport("playwright")');
    },
  );

  it.fails(
    "PARITY-02 [owner Phase 10] exposes a production Node scheduler command",
    async () => {
      const manifestText = await source("package.json");
      expect(manifestText).toMatch(/"schedule:run"\s*:/u);
    },
  );

  it("PARITY-03 [resolved Phase 4] models exhaustive R2 cursor pagination", async () => {
    const exportStorage = await source("aria/lib/export/storage.ts");
    expect(exportStorage).toMatch(/\btruncated\b/u);
    expect(exportStorage).toMatch(/\bcursor\b/u);
  });

  it.fails(
    "PARITY-05 [owner Phase 6] rejects Uno compilation failures",
    async () => {
      const compiler = await source("aria/lib/styles/compileUnoCSS.ts");
      expect(compiler).not.toContain("falling back to custom CSS only");
    },
  );
});
