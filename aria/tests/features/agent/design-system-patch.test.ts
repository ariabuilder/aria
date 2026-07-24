import { describe, expect, it } from "vitest";
import {
  AriaApplyDesignSystemPatchInputSchema,
  AriaPreviewDesignSystemPatchInputSchema,
} from "../../../admin/features/Agent/lib/schemas";
import { applyDesignMergePatch } from "../../../admin/features/Agent/lib/tools/content/designSystemPatchTools";
import {
  isDesignWriteToolName,
  isReadToolName,
} from "../../../admin/features/Agent/lib/tools/constants";

describe("design system patch contract", () => {
  it("merges objects, replaces arrays, and deletes null keys", () => {
    const current = {
      defaults: {
        body: { color: "#111", fontSize: 16 },
        section: { verticalPadding: 64 },
      },
      breakpoints: [{ id: "base", minWidth: 0 }],
    };

    expect(
      applyDesignMergePatch(current, {
        defaults: {
          body: { color: "#eee", fontSize: null },
        },
        breakpoints: [
          { id: "base", minWidth: 0 },
          { id: "lg", minWidth: 1024 },
        ],
      }),
    ).toEqual({
      defaults: {
        body: { color: "#eee" },
        section: { verticalPadding: 64 },
      },
      breakpoints: [
        { id: "base", minWidth: 0 },
        { id: "lg", minWidth: 1024 },
      ],
    });
  });

  it("requires optimistic concurrency and idempotency for apply", () => {
    expect(
      AriaApplyDesignSystemPatchInputSchema.safeParse({
        patch: { globalStyles: { defaults: {} } },
      }).success,
    ).toBe(false);
    expect(
      AriaApplyDesignSystemPatchInputSchema.safeParse({
        expectedRevision: "rev-1",
        idempotencyKey: "design-op-123",
        patch: { globalStyles: { defaults: {} } },
      }).success,
    ).toBe(true);
  });

  it("rejects empty patches and classifies preview as read-only", () => {
    expect(
      AriaPreviewDesignSystemPatchInputSchema.safeParse({ patch: {} }).success,
    ).toBe(false);
    expect(isReadToolName("aria_preview_design_system_patch")).toBe(true);
    expect(isDesignWriteToolName("aria_apply_design_system_patch")).toBe(true);
  });
});
