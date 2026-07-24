import { describe, expect, it } from "vitest";
import {
  expandTemplateToPalettes,
  getTemplate,
} from "../../lib/design/palettes";

describe("palette templates", () => {
  it("expands four base colors into independent perceptual scales", () => {
    const template = getTemplate("modern-blue");
    expect(template).toBeDefined();

    const palettes = expandTemplateToPalettes(template!);

    expect(palettes.primary[25]).not.toBe(palettes.neutral[25]);
    expect(palettes.primary[950]).not.toBe(palettes.neutral[950]);
    expect(palettes.secondary[25]).not.toBe(palettes.primary[25]);
    expect(palettes.muted[300]).not.toBe(palettes.neutral[300]);

    expect(palettes.primary.DEFAULT).toBe(template!.colors.primary);
    expect(palettes.secondary.DEFAULT).toBe(template!.colors.secondary);
    expect(palettes.muted.DEFAULT).toBe(template!.colors.muted);
    expect(palettes.neutral.DEFAULT).toBe(template!.colors.neutral);
  });

  it("defines exactly four base colors per template", () => {
    const template = getTemplate("sage");
    expect(template?.colors.primary).toBe("#4d7c6a");
    expect(template?.colors.secondary).toBe("#6b7c5c");
    expect(template?.colors.muted).toBe("#8a9a8f");
    expect(template?.colors.neutral).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
