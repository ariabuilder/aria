import { describe, expect, it } from "vitest";

import {
  ComponentDragPayloadSchema,
  ComponentInsertPayloadSchema,
  ComponentPreviewFilterStateSchema,
  ComponentThumbnailUploadSchema,
  toGroupFilter,
  parseGroupIdFromFilter,
} from "@/lib/schemas/componentPreview";
import {
  buildComponentThumbnailPreviewUrl,
  buildStoredComponentThumbnailPreviewUrl,
} from "@/features/Studio/components/composables/componentPreviewUrls";

describe("componentPreview schemas", () => {
  it("accepts valid insert payloads", () => {
    const parsed = ComponentInsertPayloadSchema.safeParse({
      type: "component",
      componentSlug: "hero-cta",
      data: {
        type: "Component",
        reference: { type: "instance", masterId: "hero-cta" },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects insert payloads without componentSlug", () => {
    const parsed = ComponentInsertPayloadSchema.safeParse({
      type: "component",
      data: { type: "Component" },
    });

    expect(parsed.success).toBe(false);
  });

  it("parses drag payloads", () => {
    const parsed = ComponentDragPayloadSchema.safeParse({
      type: "component",
      componentSlug: "hero-cta",
      data: { type: "Component" },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects drag payloads without componentSlug", () => {
    const parsed = ComponentDragPayloadSchema.safeParse({
      type: "component",
      data: { type: "Component" },
    });

    expect(parsed.success).toBe(false);
  });

  it("parses filter state and group helpers", () => {
    const parsed = ComponentPreviewFilterStateSchema.safeParse({
      activeFilter: "group:grp-1",
      searchQuery: "hero",
    });

    expect(parsed.success).toBe(true);
    expect(toGroupFilter("grp-1")).toBe("group:grp-1");
    expect(parseGroupIdFromFilter("group:grp-1")).toBe("grp-1");
    expect(parseGroupIdFromFilter("all")).toBeNull();
  });

  it("does not build component thumbnail preview urls from component id alone", () => {
    const url = buildComponentThumbnailPreviewUrl({
      componentId: "hero-cta",
      inert: true,
    });

    expect(url).toBe("");
  });

  it("builds canonical stored thumbnail preview urls from component id", () => {
    const url = buildStoredComponentThumbnailPreviewUrl({
      componentId: "hero cta",
      thumbnailRefreshToken: "token-1",
      inert: true,
    });

    expect(url).toBe("/admin/api/component-thumbnails/hero%20cta?cv=token-1");
  });

  it("builds component thumbnail preview urls from stored thumbnail urls", () => {
    const url = buildComponentThumbnailPreviewUrl({
      componentId: "hero-cta",
      thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
      thumbnailRefreshToken: "token-1",
      inert: true,
    });

    expect(url).toContain("/admin/api/component-thumbnails/hero-cta");
    expect(url).toContain("cv=token-1");
  });

  it("ignores malformed generated thumbnail urls", () => {
    const url = buildComponentThumbnailPreviewUrl(
      {
        componentId: "hero-cta",
        thumbnailUrl: "/admin/api/component-thumbnails/hero-cta",
        inert: true,
      },
      { data: "/admin/api/component-thumbnails/hero-cta" } as never,
    );

    expect(url).toBe("/admin/api/component-thumbnails/hero-cta");
  });

  it("validates thumbnail upload input", () => {
    const parsed = ComponentThumbnailUploadSchema.safeParse({
      componentId: "hero-cta",
      mimeType: "image/webp",
      fileBase64: "aGVsbG8=",
    });

    expect(parsed.success).toBe(true);
  });
});
