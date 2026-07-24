import { describe, expect, it } from "vitest";
import type { SessionUser } from "../../lib/auth/types";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { ContentMutationKindSchema } from "../../lib/storage/adapter";
import { getOperationsForCapability } from "../../lib/auth/capabilityOperations";

const editor: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "editor-a",
  email: "editor-a@example.com",
  role: "content-editor",
  totpEnabled: false,
};

describe("discovery settings capabilities", () => {
  it("does not grant settings.updateDiscovery to editSiteSettings alone", () => {
    const siteSettingsOps = getOperationsForCapability("editSiteSettings");
    expect(siteSettingsOps).not.toContain("settings.updateDiscovery");
  });

  it("grants settings.updateDiscovery to editDiscoverySettings", () => {
    const discoveryOps = getOperationsForCapability("editDiscoverySettings");
    expect(discoveryOps).toContain("settings.updateDiscovery");
    expect(discoveryOps).toContain("discovery.getGeneratedBaseline");
  });

  it("does not grant discovery mutation to manageBilling", () => {
    const billingOps = getOperationsForCapability("manageBilling");
    expect(billingOps).not.toContain("settings.updateDiscovery");
  });

  it("uses a registered mutation kind for discovery settings saves", () => {
    expect(ContentMutationKindSchema.safeParse("save-site-settings").success).toBe(
      true,
    );
    expect(ContentMutationKindSchema.safeParse("save-discovery-settings").success).toBe(
      false,
    );

    const authorship = buildAuthorshipSaveContext(editor, "save-site-settings");
    expect(authorship.mutationKind).toBe("save-site-settings");
  });
});
