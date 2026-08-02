import { describe, expect, it } from "vitest";

import { inspectRenderingWriterSource } from "../../scripts/check-rendering-writer-boundaries";

describe("rendering writer boundary ratchet", () => {
  it("rejects a new direct dsl_json writer without normalization", () => {
    const source = `
      await database.execute({
        sql: "INSERT INTO aria_page_versions (id, dsl_json) VALUES (?, ?)",
        args: [id, JSON.stringify(page)],
      });
    `;

    expect(inspectRenderingWriterSource("unsafe-writer.ts", source)).toEqual({
      file: "unsafe-writer.ts",
      message:
        "direct Page/Layout/Component dsl_json write does not use the shared surface normalizer",
    });
  });

  it("accepts a direct writer that prepares a normalized surface version", () => {
    const source = `
      import { prepareNormalizedSurfaceVersion } from "../lib/storage/internal/domains/surfaceNormalization";
      const prepared = await prepareNormalizedSurfaceVersion(input);
      await database.execute({
        sql: "INSERT INTO aria_component_versions (id, dsl_json) VALUES (?, ?)",
        args: [id, JSON.stringify(prepared.source)],
      });
    `;

    expect(inspectRenderingWriterSource("safe-writer.ts", source)).toBeNull();
  });
});
