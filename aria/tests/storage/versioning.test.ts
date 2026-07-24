import { describe, expect, it } from "vitest";

import {
  allocateVersionId,
  buildVersionHashPayload,
  computeVersionContentHash,
  DEFAULT_RECENT_VERSION_LIMIT,
  isStorageVersionConflictError,
  selectRetainedVersions,
  VersionRetentionPolicySchema,
  VersionSaveOptionsSchema,
} from "../../lib/storage/versioning";

describe("storage versioning helpers", () => {
  it("allocates unique version ids for rapid sequential saves", () => {
    const first = allocateVersionId();
    const second = allocateVersionId();
    const third = allocateVersionId();

    expect(first).toMatch(/^\d+(-\d+)?$/u);
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it("detects storage version conflict errors", () => {
    expect(
      isStorageVersionConflictError(
        new Error(
          "D1_ERROR: UNIQUE constraint failed: aria_page_versions.id, aria_page_versions.version",
        ),
      ),
    ).toBe(true);
    expect(isStorageVersionConflictError(new Error("network timeout"))).toBe(
      false,
    );
  });

  it("validates typed version save options", () => {
    const parsed = VersionSaveOptionsSchema.parse({
      preserveVersion: true,
      skipIfContentUnchanged: true,
      versionHint: "1776200000000",
    });

    expect(parsed).toEqual({
      preserveVersion: true,
      skipIfContentUnchanged: true,
      versionHint: "1776200000000",
    });
  });

  it("builds a stable hash payload while ignoring transient top-level fields", () => {
    const firstPayload = buildVersionHashPayload({
      id: "page-home",
      title: "Home",
      version: "1",
      author: { id: "old-editor", name: "Old Editor" },
      createdAt: "2026-04-15T11:00:00.000Z",
      updatedAt: "2026-04-15T12:00:00.000Z",
      publishedAt: "2026-04-15T12:00:00.000Z",
      isModifiedSincePublish: false,
      _computedMetrics: {
        sectionCount: 1,
        componentCount: 0,
        mediaCount: 0,
        dynamicCount: 0,
        customCodeCount: 0,
        computedAt: "2026-04-15T12:00:00.000Z",
        contentHash: "old-hash",
      },
      nested: {
        version: "keep-me",
      },
    });
    const secondPayload = buildVersionHashPayload({
      updatedAt: "2026-04-15T12:05:00.000Z",
      publishedAt: "2026-04-15T12:05:00.000Z",
      createdAt: "2026-04-15T11:05:00.000Z",
      author: { id: "new-editor", name: "New Editor" },
      title: "Home",
      _computedMetrics: {
        sectionCount: 99,
        componentCount: 99,
        mediaCount: 99,
        dynamicCount: 99,
        customCodeCount: 99,
        computedAt: "2026-04-15T12:05:00.000Z",
        contentHash: "new-hash",
      },
      nested: {
        version: "keep-me",
      },
      id: "page-home",
      version: "2",
      isModifiedSincePublish: true,
    });

    expect(firstPayload).toBe(secondPayload);
    expect(firstPayload).toContain('"version":"keep-me"');
    expect(firstPayload).not.toContain("_computedMetrics");
    expect(firstPayload).not.toContain("isModifiedSincePublish");
    expect(firstPayload).not.toContain("Old Editor");
    expect(firstPayload).not.toContain("publishedAt");
  });

  it("computes the same content hash for semantically unchanged saves", async () => {
    const firstHash = await computeVersionContentHash({
      id: "page-home",
      title: "Home",
      version: "1",
      author: { id: "old-editor", name: "Old Editor" },
      createdAt: "2026-04-15T11:00:00.000Z",
      updatedAt: "2026-04-15T12:00:00.000Z",
      publishedAt: "2026-04-15T12:00:00.000Z",
      isModifiedSincePublish: false,
      _computedMetrics: {
        sectionCount: 1,
        componentCount: 0,
        mediaCount: 0,
        dynamicCount: 0,
        customCodeCount: 0,
        computedAt: "2026-04-15T12:00:00.000Z",
        contentHash: "old-hash",
      },
    });
    const secondHash = await computeVersionContentHash({
      id: "page-home",
      title: "Home",
      version: "2",
      author: { id: "new-editor", name: "New Editor" },
      createdAt: "2026-04-15T11:05:00.000Z",
      updatedAt: "2026-04-15T12:05:00.000Z",
      publishedAt: "2026-04-15T12:05:00.000Z",
      isModifiedSincePublish: true,
      _computedMetrics: {
        sectionCount: 99,
        componentCount: 99,
        mediaCount: 99,
        dynamicCount: 99,
        customCodeCount: 99,
        computedAt: "2026-04-15T12:05:00.000Z",
        contentHash: "new-hash",
      },
    });
    const thirdHash = await computeVersionContentHash({
      id: "page-home",
      title: "Home Updated",
      version: "3",
      updatedAt: "2026-04-15T12:10:00.000Z",
    });

    expect(firstHash).toBe(secondHash);
    expect(thirdHash).not.toBe(secondHash);
  });

  it("defaults retention to the recent version limit", () => {
    expect(VersionRetentionPolicySchema.parse({})).toEqual({
      keepLatest: DEFAULT_RECENT_VERSION_LIMIT,
      pinnedVersions: [],
    });
  });

  it("keeps recent and pinned versions while pruning older unpinned history", () => {
    const selection = selectRetainedVersions({
      versions: [
        { version: "100", createdAt: "2026-04-15T12:00:00.000Z" },
        { version: "099", createdAt: "2026-04-15T11:59:00.000Z" },
        { version: "098", createdAt: "2026-04-15T11:58:00.000Z" },
        { version: "097", createdAt: "2026-04-15T11:57:00.000Z" },
        { version: "096", createdAt: "2026-04-15T11:56:00.000Z" },
      ],
      policy: {
        keepLatest: 2,
        pinnedVersions: ["096", "098"],
      },
    });

    expect(selection.keepVersions).toEqual(["100", "099", "098", "096"]);
    expect(selection.deleteVersions).toEqual(["097"]);
  });
});
