import { describe, expect, it } from "vitest";
import {
  canEditItemInComposer,
  composerOperationForItemType,
  StudioItemTypeSchema,
} from "../../admin/composables/useComposerAccess";
import {
  getCapabilitiesForOperation,
  type OperationId,
} from "../../lib/auth/capabilityOperations";
import {
  resolveEffectiveCapabilities,
  type Capability,
  type UserPermissionProfile,
} from "../../lib/auth/types";

function canOperationFromProfile(
  profile: UserPermissionProfile,
  operationId: OperationId,
): boolean {
  const caps = resolveEffectiveCapabilities(profile);
  const required = getCapabilitiesForOperation(operationId);
  if (required.length === 0) return false;
  return required.some((capability: Capability) => caps.includes(capability));
}

describe("useComposerAccess", () => {
  it("maps item types to save operations", () => {
    expect(composerOperationForItemType("page")).toBe("save.page");
    expect(composerOperationForItemType("layout")).toBe("save.layout");
    expect(composerOperationForItemType("component")).toBe("save.component");
  });

  it("rejects invalid item types via Zod", () => {
    expect(() =>
      StudioItemTypeSchema.parse("post"),
    ).toThrow();
  });

  it("denies composer for contributor preset", () => {
    const profile: UserPermissionProfile = { rolePreset: "contributor" };
    expect(
      canEditItemInComposer(
        (op) => canOperationFromProfile(profile, op),
        "page",
      ),
    ).toBe(false);
  });

  it("allows composer for content-editor preset", () => {
    const profile: UserPermissionProfile = { rolePreset: "content-editor" };
    expect(
      canEditItemInComposer(
        (op) => canOperationFromProfile(profile, op),
        "page",
      ),
    ).toBe(true);
  });
});
