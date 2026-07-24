import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNode } from "../fixtures/testDataGenerator";

describe("itemLoadingActionResults", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects malformed compose action payloads", async () => {
    const { unwrapItemLoadingComposeResult } =
      await import("../../admin/composables/itemLoadingActionResults");

    const result = unwrapItemLoadingComposeResult(
      {
        data: {
          pageBlocks: [{ id: "broken-node" }],
          originalNodes: [createNode({ id: "node-1" })],
          nonce: "nonce-home",
          pageMetadata: {
            slug: "home",
            settings: {},
          },
        },
        error: null,
      },
      "Invalid compose payload",
      { slug: "home" },
    );

    expect(result).toEqual({
      success: false,
      error: "Invalid compose payload",
    });
  });

  it("preserves valid component metadata fields from compose payloads", async () => {
    const { unwrapItemLoadingComposeResult } =
      await import("../../admin/composables/itemLoadingActionResults");

    const result = unwrapItemLoadingComposeResult(
      {
        data: {
          pageBlocks: [createNode({ id: "component-block" })],
          originalNodes: [createNode({ id: "component-source" })],
          nonce: "nonce-component",
          pageMetadata: {
            id: "component-card",
            name: "Card",
            slug: "card",
            settings: {},
            category: "Marketing",
            propSchema: [
              {
                name: "headline",
                type: "string",
                label: "Headline",
              },
            ],
            slots: [{ name: "default", label: "Default", required: true }],
          },
          currentLayout: null,
        },
        error: null,
      },
      "Invalid compose payload",
      { slug: "card" },
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected compose result to parse successfully");
    }

    expect(result.data.pageMetadata.category).toBe("Marketing");
    expect(result.data.pageMetadata.propSchema?.[0]?.name).toBe("headline");
    expect(result.data.pageMetadata.slots?.[0]?.name).toBe("default");
    expect(result.data.pageMetadata.name).toBe("Card");
  });

  it("accepts compose layouts whose slots omit label and required", async () => {
    const { unwrapItemLoadingComposeResult } =
      await import("../../admin/composables/itemLoadingActionResults");

    const result = unwrapItemLoadingComposeResult(
      {
        data: {
          pageBlocks: [createNode({ id: "page-block" })],
          originalNodes: [createNode({ id: "page-source" })],
          nonce: "nonce-page",
          pageMetadata: {
            id: "page-home",
            title: "Home",
            slug: "index",
            status: "draft",
            updatedAt: "2026-04-01T00:00:00.000Z",
            settings: {},
            frontmatter: {},
            layout: "default",
            regions: {},
          },
          currentLayout: {
            id: "default",
            slug: "default",
            title: "Default",
            slots: [{ name: "main" }],
            regions: {},
          },
        },
        error: null,
      },
      "Invalid compose payload",
      { slug: "index" },
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected page compose payload to parse successfully");
    }

    expect(result.data.currentLayout?.slots?.[0]?.name).toBe("main");
  });

  it("normalizes empty page layout metadata to undefined", async () => {
    const { unwrapItemLoadingComposeResult } =
      await import("../../admin/composables/itemLoadingActionResults");

    const result = unwrapItemLoadingComposeResult(
      {
        data: {
          pageBlocks: [createNode({ id: "page-block" })],
          originalNodes: [createNode({ id: "page-source" })],
          nonce: "nonce-page",
          pageMetadata: {
            id: "page-home",
            title: "Home",
            slug: "index",
            status: "draft",
            updatedAt: "2026-04-01T00:00:00.000Z",
            settings: {},
            frontmatter: {},
            layout: "",
            regions: {},
          },
          currentLayout: null,
        },
        error: null,
      },
      "Invalid compose payload",
      { slug: "index" },
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected page compose payload to parse successfully");
    }

    expect(result.data.pageMetadata.layout).toBeUndefined();
  });
});
