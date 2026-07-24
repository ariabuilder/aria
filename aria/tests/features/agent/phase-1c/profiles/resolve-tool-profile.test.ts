import { describe, it, expect } from "vitest";
import { resolveToolProfile } from "@/features/Agent/lib/tools/toolProfiles";
import type { AgentShellContext } from "@/features/Agent/lib/schemas";

function ctx(workspace?: "studio" | "composer" | "design"): AgentShellContext {
  return {
    mode:
      workspace === "composer" ? ("composer" as const) : ("studio" as const),
    workspace: workspace ?? "studio",
    itemType: null,
    itemSlug: null,
    itemTitle: null,
    pageId: null,
    selectedBlockId: null,
    blockCount: 0,
    canClientInsert: false,
    canClientNavigate: false,
  };
}

describe("resolveToolProfile", () => {
  it("returns studio for null shell context", () => {
    const profile = resolveToolProfile(undefined);
    expect(profile.id).toBe("studio");
  });

  it("returns composer for composer workspace", () => {
    const profile = resolveToolProfile(ctx("composer"));
    expect(profile.id).toBe("composer");
  });

  it("returns design for design workspace", () => {
    const profile = resolveToolProfile(ctx("design"));
    expect(profile.id).toBe("design");
  });

  it("returns studio for unknown workspace", () => {
    const profile = resolveToolProfile(ctx("unknown" as never));
    expect(profile.id).toBe("studio");
  });

  it("returns mcp for mcp transport regardless of workspace", () => {
    const profile = resolveToolProfile(ctx("studio"), "mcp");
    expect(profile.id).toBe("mcp");
  });

  it("returns mcp for mcp transport even with composer workspace", () => {
    const profile = resolveToolProfile(ctx("composer"), "mcp");
    expect(profile.id).toBe("mcp");
  });

  it("studio profile includes read category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).toContain("read");
  });

  it("studio profile includes design_write category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    // After fix: design tools available everywhere (gated by capability)
    expect(profile.serverCategories).toContain("design_write");
  });

  it("studio profile includes class_write category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).toContain("class_write");
  });

  it("studio profile includes variable_write category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).toContain("variable_write");
  });

  it("studio profile includes font category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).toContain("font");
  });

  it("studio profile excludes content_write category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).not.toContain("content_write");
  });

  it("studio profile includes seo_write category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.serverCategories).toContain("seo_write");
  });

  it("studio profile includes navigate client category", () => {
    const profile = resolveToolProfile(ctx("studio"));
    expect(profile.clientCategories).toContain("navigate");
  });

  it("composer profile includes all server categories", () => {
    const profile = resolveToolProfile(ctx("composer"));
    expect(profile.serverCategories).toContain("read");
    expect(profile.serverCategories).toContain("design_write");
    expect(profile.serverCategories).toContain("content_write");
    expect(profile.serverCategories).toContain("class_write");
    expect(profile.serverCategories).toContain("variable_write");
    expect(profile.serverCategories).toContain("font");
  });

  it("composer profile includes all client categories", () => {
    const profile = resolveToolProfile(ctx("composer"));
    expect(profile.clientCategories).toContain("navigate");
    expect(profile.clientCategories).toContain("canvas");
    expect(profile.clientCategories).toContain("file_upload");
  });

  it("design profile excludes content_write", () => {
    const profile = resolveToolProfile(ctx("design"));
    expect(profile.serverCategories).not.toContain("content_write");
  });

  it("design profile excludes canvas client tools", () => {
    const profile = resolveToolProfile(ctx("design"));
    expect(profile.clientCategories).not.toContain("canvas");
  });

  it("design profile excludes file_upload client tools", () => {
    const profile = resolveToolProfile(ctx("design"));
    expect(profile.clientCategories).not.toContain("file_upload");
  });

  it("mcp profile includes all server categories", () => {
    const profile = resolveToolProfile(undefined, "mcp");
    expect(profile.serverCategories).toContain("content_write");
    expect(profile.serverCategories).toContain("design_write");
  });

  it("mcp profile excludes all client categories", () => {
    const profile = resolveToolProfile(undefined, "mcp");
    expect(profile.clientCategories).toEqual([]);
  });
});
