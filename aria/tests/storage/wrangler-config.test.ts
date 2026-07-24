import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  parseD1BindingFromWrangler,
  parseR2BindingFromWrangler,
  readWranglerToml,
} from "../../lib/storage/wrangler-config";

const wranglerFixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/wrangler-starter.toml",
);

describe("wrangler-config", () => {
  it("parses the aria_db binding from wrangler.toml", () => {
    const toml = readWranglerToml(wranglerFixturePath);
    const binding = parseD1BindingFromWrangler(toml, "aria_db");

    expect(binding.binding).toBe("aria_db");
    expect(binding.databaseName).toBe("aria-db");
    expect(binding.databaseId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("parses the aria_r2 binding from wrangler.toml", () => {
    const toml = readWranglerToml(wranglerFixturePath);
    const binding = parseR2BindingFromWrangler(toml, "aria_r2");

    expect(binding.binding).toBe("aria_r2");
    expect(binding.bucketName).toBe("aria-media");
  });
});
