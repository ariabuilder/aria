import { describe, expect, it } from "vitest";

import {
  buildPermissionProfile,
  permissionProfilesEqual,
  resolveEffectiveCapabilities,
  ROLE_DEFAULT_CAPABILITIES,
} from "../../../lib/auth/types";

describe("resolveEffectiveCapabilities", () => {
  it("returns preset defaults for each role", () => {
    expect(
      resolveEffectiveCapabilities({ rolePreset: "administrator" }),
    ).toEqual(ROLE_DEFAULT_CAPABILITIES.administrator);
    expect(resolveEffectiveCapabilities({ rolePreset: "manager" })).toEqual(
      ROLE_DEFAULT_CAPABILITIES.manager,
    );
    expect(
      resolveEffectiveCapabilities({ rolePreset: "content-editor" }),
    ).toEqual(ROLE_DEFAULT_CAPABILITIES["content-editor"]);
    expect(
      resolveEffectiveCapabilities({ rolePreset: "contributor" }),
    ).toEqual(ROLE_DEFAULT_CAPABILITIES.contributor);
  });

  it("includes sync and export capabilities on manager preset", () => {
    const managerCaps = resolveEffectiveCapabilities({ rolePreset: "manager" });
    expect(managerCaps).toContain("syncMedia");
    expect(managerCaps).toContain("manageExports");
    expect(managerCaps).toContain("manageBackups");
  });

  it("excludes syncMedia from content-editor and contributor presets", () => {
    for (const rolePreset of ["content-editor", "contributor"] as const) {
      const caps = resolveEffectiveCapabilities({ rolePreset });
      expect(caps).not.toContain("syncMedia");
      expect(caps).not.toContain("manageExports");
    }
  });

  it("adds capabilities through allow overrides", () => {
    const caps = resolveEffectiveCapabilities({
      rolePreset: "contributor",
      capabilityOverrides: { allow: ["publishContent"] },
    });

    expect(caps).toContain("publishContent");
    expect(caps).toContain("editCms");
    expect(caps).not.toContain("editPageContent");
  });

  it("removes capabilities through deny overrides", () => {
    const caps = resolveEffectiveCapabilities({
      rolePreset: "manager",
      capabilityOverrides: { deny: ["deletePages"] },
    });

    expect(caps).not.toContain("deletePages");
    expect(caps).toContain("editPages");
  });

  it("applies deny after allow when both are present", () => {
    const caps = resolveEffectiveCapabilities({
      rolePreset: "contributor",
      capabilityOverrides: {
        allow: ["publishContent"],
        deny: ["publishContent"],
      },
    });

    expect(caps).not.toContain("publishContent");
  });
});

describe("buildPermissionProfile", () => {
  it("builds a preset-only profile", () => {
    expect(buildPermissionProfile("manager")).toEqual({
      rolePreset: "manager",
    });
  });

  it("preserves non-empty overrides", () => {
    expect(
      buildPermissionProfile("manager", {
        allow: ["manageExports"],
        deny: ["deletePages"],
      }),
    ).toEqual({
      rolePreset: "manager",
      capabilityOverrides: {
        allow: ["manageExports"],
        deny: ["deletePages"],
      },
    });
  });

  it("drops empty override arrays", () => {
    expect(
      buildPermissionProfile("manager", {
        allow: [],
        deny: [],
      }),
    ).toEqual({
      rolePreset: "manager",
    });
  });
});

describe("permissionProfilesEqual", () => {
  it("treats undefined profiles as equal", () => {
    expect(permissionProfilesEqual(undefined, undefined)).toBe(true);
  });

  it("treats matching profiles as equal regardless of override order", () => {
    expect(
      permissionProfilesEqual(
        {
          rolePreset: "manager",
          capabilityOverrides: {
            allow: ["manageExports", "syncMedia"],
            deny: ["deletePages"],
          },
        },
        {
          rolePreset: "manager",
          capabilityOverrides: {
            allow: ["syncMedia", "manageExports"],
            deny: ["deletePages"],
          },
        },
      ),
    ).toBe(true);
  });

  it("detects preset changes", () => {
    expect(
      permissionProfilesEqual(
        { rolePreset: "manager" },
        { rolePreset: "contributor" },
      ),
    ).toBe(false);
  });

  it("detects override changes", () => {
    expect(
      permissionProfilesEqual(
        {
          rolePreset: "manager",
          capabilityOverrides: { deny: ["deletePages"] },
        },
        {
          rolePreset: "manager",
          capabilityOverrides: { deny: ["publishContent"] },
        },
      ),
    ).toBe(false);
  });

  it("treats missing and empty overrides as equal", () => {
    expect(
      permissionProfilesEqual(
        { rolePreset: "manager" },
        {
          rolePreset: "manager",
          capabilityOverrides: { allow: [], deny: [] },
        },
      ),
    ).toBe(true);
  });
});
