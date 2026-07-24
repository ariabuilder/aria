import { describe, expect, it } from "vitest";

import {
  CAPABILITY_OPERATIONS,
  getCapabilitiesForOperation,
  getOperationsForCapability,
  OperationIdSchema,
} from "../../../lib/auth/capabilityOperations";
import { CapabilitySchema } from "../../../lib/auth/types";

describe("CAPABILITY_OPERATIONS", () => {
  it("includes every capability from CapabilitySchema", () => {
    const capabilities = CapabilitySchema.options;
    expect(Object.keys(CAPABILITY_OPERATIONS).sort()).toEqual(
      [...capabilities].sort(),
    );
    for (const capability of capabilities) {
      expect(CAPABILITY_OPERATIONS[capability]).toBeDefined();
      expect(CAPABILITY_OPERATIONS[capability].length).toBeGreaterThan(0);
    }
  });

  it("uses valid operation id strings", () => {
    for (const operations of Object.values(CAPABILITY_OPERATIONS)) {
      for (const operation of operations) {
        expect(() => OperationIdSchema.parse(operation)).not.toThrow();
      }
    }
  });

  it("resolves read/write component grouping capabilities separately", () => {
    const readCaps = getCapabilitiesForOperation("settings.getComponentGrouping");
    expect(readCaps).toContain("editPageContent");
    expect(readCaps).toContain("editCms");
    expect(readCaps).not.toContain("editStudioPreferences");

    const writeCaps = getCapabilitiesForOperation(
      "settings.updateComponentGrouping",
    );
    expect(writeCaps).toContain("editSiteSettings");
    expect(writeCaps).not.toContain("editStudioPreferences");
  });

  it("resolves read/write media grouping capabilities separately", () => {
    const readCaps = getCapabilitiesForOperation("settings.getMediaGrouping");
    expect(readCaps).toContain("editPageContent");
    expect(readCaps).toContain("editCms");

    const writeCaps = getCapabilitiesForOperation("settings.updateMediaGrouping");
    expect(writeCaps).toContain("editSiteSettings");
  });

  it("maps editStudioPreferences to appearance only", () => {
    const ops = getOperationsForCapability("editStudioPreferences");
    expect(ops).toContain("settings.updateAppearance");
    expect(ops).not.toContain("settings.getComponentGrouping");
    expect(ops).not.toContain("settings.updateComponentGrouping");
  });

  it("allows redirect managers to list valid redirect targets", () => {
    const ops = getOperationsForCapability("manageRedirects");
    expect(ops).toContain("redirects.listTargets");
  });
});
