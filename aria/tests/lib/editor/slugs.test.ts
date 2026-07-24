import { describe, expect, it } from "vitest";
import { editorSlugsMatch, normalizeEditorSlug } from "@/lib/editor/slugs";

describe("editor slugs", () => {
  it("normalizes index aliases", () => {
    expect(normalizeEditorSlug("/")).toBe("index");
    expect(normalizeEditorSlug("index")).toBe("index");
    expect(normalizeEditorSlug("home")).toBe("home");
  });

  it("matches slugs after normalization", () => {
    expect(editorSlugsMatch("index", "/")).toBe(true);
    expect(editorSlugsMatch("home", "about")).toBe(false);
  });
});
