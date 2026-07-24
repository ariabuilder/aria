import { describe, expect, it } from "vitest";
import {
  CanonicalIconIdSchema,
  IconReferenceSchema,
  IconPropInputSchema,
  getCanonicalIconIdFromValue,
  getIconClassFromValue,
  normalizeIconValue,
  parseCanonicalIconId,
  toCanonicalIconId,
} from "../../lib/icons/reference";

describe("icon reference schema + normalization", () => {
  it("accepts canonical icon ids", () => {
    const result = CanonicalIconIdSchema.safeParse("lucide:star");
    expect(result.success).toBe(true);
  });

  it("rejects invalid canonical icon ids", () => {
    const result = CanonicalIconIdSchema.safeParse("legacy:STAR");
    expect(result.success).toBe(false);
  });

  it("normalizes class-prefixed icon string into canonical object", () => {
    const normalized = normalizeIconValue("i-lucide:star");

    expect(typeof normalized).toBe("object");
    expect(IconReferenceSchema.safeParse(normalized).success).toBe(true);

    expect(normalized).toMatchObject({
      id: "lucide:star",
      pack: "lucide",
      name: "star",
      source: "iconify",
      version: "2026-02-25-snapshot",
    });
  });

  it("keeps explicit reference object unchanged", () => {
    const reference = {
      id: "lucide:camera",
      pack: "lucide",
      name: "camera",
      source: "iconify",
      version: "2026-02-25-snapshot",
    } as const;

    const normalized = normalizeIconValue(reference);
    expect(normalized).toEqual(reference);
  });

  it("keeps non-canonical freeform strings as strings", () => {
    const normalized = normalizeIconValue("custom-icon-name");
    expect(normalized).toBe("custom-icon-name");
  });

  it("derives icon class from reference object", () => {
    const iconClass = getIconClassFromValue({
      id: "lucide:brain",
      pack: "lucide",
      name: "brain",
      source: "iconify",
      version: "2026-02-25-snapshot",
    });

    expect(iconClass).toBe("i-lucide:brain");
  });

  it("extracts canonical id from both string and object", () => {
    expect(getCanonicalIconIdFromValue("i-lucide:star")).toBe(
      "lucide:star",
    );

    expect(
      getCanonicalIconIdFromValue({
        id: "coreui-brands:github",
        pack: "coreui-brands",
        name: "github",
        source: "iconify",
        version: "2026-02-25-snapshot",
      }),
    ).toBe("coreui-brands:github");
  });

  it("parses canonical id into pack/name parts", () => {
    const parsed = parseCanonicalIconId("coreui-brands:twitter");

    expect(parsed).toEqual({
      id: "coreui-brands:twitter",
      pack: "coreui-brands",
      name: "twitter",
    });
  });

  it("validates icon prop input union", () => {
    expect(
      IconPropInputSchema.safeParse("i-lucide:star").success,
    ).toBe(true);

    expect(
      IconPropInputSchema.safeParse({
        id: "lucide:star",
        pack: "lucide",
        name: "star",
        source: "iconify",
        version: "2026-02-25-snapshot",
      }).success,
    ).toBe(true);
  });

  it("normalizes canonical id extraction from class-prefixed strings", () => {
    expect(toCanonicalIconId("i-lucide:alarm-clock")).toBe(
      "lucide:alarm-clock",
    );
  });
});
