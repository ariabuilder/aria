import { describe, expect, it, vi } from "vitest";

import {
  normalizeSurfaceForPersistence,
  prepareSurfaceForPersistence,
  resolveStoredSemanticSourceHash,
} from "../../lib/storage/internal/domains/surfaceNormalization";
import type { PageDSL } from "../../lib/types/nodes";

vi.mock("../../lib/utils/logger", () => ({ log: vi.fn() }));

const page: PageDSL = {
  id: "page-normalization",
  slug: "normalization",
  title: "Normalization",
  status: "draft",
  nodes: [],
  settings: {},
};

describe("surface persistence normalization", () => {
  it("consumes an action-prepared normalized surface exactly once", async () => {
    const prepared = await prepareSurfaceForPersistence("page", page);

    expect(Object.isFrozen(prepared.source)).toBe(true);
    await expect(
      normalizeSurfaceForPersistence("page", prepared.source),
    ).resolves.toBe(prepared);

    const normalizedAgain = await normalizeSurfaceForPersistence(
      "page",
      prepared.source,
    );
    expect(normalizedAgain).not.toBe(prepared);
    expect(normalizedAgain.sourceHash).toBe(prepared.sourceHash);
  });

  it("uses a marked canonical source hash without reparsing stored DSL", async () => {
    const fallback = vi.fn(async () => "fallback");
    const sourceHash = "a".repeat(64);

    await expect(
      resolveStoredSemanticSourceHash({
        kind: "page",
        row: {
          content_hash: sourceHash,
          compiler_metadata_json: JSON.stringify({
            renderSourceHashVersion: 1,
          }),
          dsl_json: "not-json",
        },
        fallback,
      }),
    ).resolves.toBe(sourceHash);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("retains semantic normalization for unmarked legacy rows", async () => {
    const fallback = vi.fn(async () => "fallback");
    const expected = await normalizeSurfaceForPersistence("page", page);

    await expect(
      resolveStoredSemanticSourceHash({
        kind: "page",
        row: {
          content_hash: "legacy-hash",
          compiler_metadata_json: JSON.stringify({}),
          dsl_json: JSON.stringify({
            ...page,
            version: "legacy-version",
            updatedAt: "2020-01-01T00:00:00.000Z",
          }),
        },
        fallback,
      }),
    ).resolves.toBe(expected.sourceHash);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("does not trust malformed hashes even when metadata is marked", async () => {
    const fallback = vi.fn(async () => "fallback");

    await expect(
      resolveStoredSemanticSourceHash({
        kind: "page",
        row: {
          content_hash: "not-a-canonical-sha",
          compiler_metadata_json: JSON.stringify({
            renderSourceHashVersion: 1,
          }),
          dsl_json: "not-json",
        },
        fallback,
      }),
    ).resolves.toBe("fallback");
    expect(fallback).toHaveBeenCalledOnce();
  });
});
