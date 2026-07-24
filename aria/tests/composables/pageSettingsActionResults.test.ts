import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSimplePage } from "../fixtures/testDataGenerator";

const loggerMock = vi.fn();

vi.mock("@/lib/utils/logger", () => ({
  log: loggerMock,
}));

describe("pageSettingsActionResults", () => {
  beforeEach(() => {
    loggerMock.mockReset();
  });

  it("rejects malformed page getItem payloads", async () => {
    const { unwrapPageSettingsPageResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const result = unwrapPageSettingsPageResult(
      {
        data: {
          id: "home",
          slug: "home",
          nodes: 42,
        },
        error: null,
      },
      "Failed to load current page",
      {
        source: "PageSettingsPanel.handleSave.getItem",
        slug: "home",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load current page",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Composer/PageSettings] Invalid page payload from getItem",
      expect.objectContaining({
        source: "PageSettingsPanel.handleSave.getItem",
        slug: "home",
        issues: expect.any(Array),
      }),
    );
  });

  it("surfaces embedded updateItem failures", async () => {
    const { unwrapPageSettingsUpdateResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const result = unwrapPageSettingsUpdateResult(
      {
        data: {
          success: false,
          error: {
            message: "Page already exists: home",
          },
        },
        error: null,
      },
      "Failed to save page settings",
    );

    expect(result).toEqual({
      success: false,
      error: "Page already exists: home",
    });
  });

  it("returns the revision created by updateItem", async () => {
    const { unwrapPageSettingsUpdateResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const result = unwrapPageSettingsUpdateResult(
      {
        data: {
          success: true,
          slug: "home",
          version: "page-home-v2",
        },
        error: null,
      },
      "Failed to save page settings",
    );

    expect(result).toEqual({
      success: true,
      slug: "home",
      version: "page-home-v2",
    });
  });

  it("accepts valid page policy payloads", async () => {
    const { unwrapPageSettingsPolicyResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const result = unwrapPageSettingsPolicyResult(
      {
        data: {
          id: "home-id",
          slug: "home",
          systemRole: "standard",
          accessMode: "password",
          hasPassword: true,
          promptTitle: "Protected page",
          promptDescription: "Enter the password to continue.",
          rememberForDays: 7,
          policyVersion: 2,
        },
        error: null,
      },
      "Failed to load page access settings",
    );

    expect(result).toEqual({
      success: true,
      data: {
        id: "home-id",
        slug: "home",
        systemRole: "standard",
        accessMode: "password",
        hasPassword: true,
        promptTitle: "Protected page",
        promptDescription: "Enter the password to continue.",
        rememberForDays: 7,
        policyVersion: 2,
      },
    });
  });

  it("rejects malformed page policy payloads", async () => {
    const { unwrapPageSettingsPolicyResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const result = unwrapPageSettingsPolicyResult(
      {
        data: {
          id: "home-id",
          slug: "home",
          systemRole: "standard",
          accessMode: "password",
          hasPassword: "yes",
          policyVersion: 2,
        },
        error: null,
      },
      "Failed to load page access settings",
      {
        source: "PageSettingsPanel.loadPolicy",
        slug: "home",
      },
    );

    expect(result).toEqual({
      success: false,
      error: "Failed to load page access settings",
    });
    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "[Composer/PageSettings] Invalid page policy payload",
      expect.objectContaining({
        source: "PageSettingsPanel.loadPolicy",
        slug: "home",
        issues: expect.any(Array),
      }),
    );
  });

  it("accepts valid page payloads", async () => {
    const { unwrapPageSettingsPageResult } =
      await import("../../admin/features/Composer/composables/pageSettingsActionResults");

    const page = createSimplePage("Home", { slug: "home" });

    const result = unwrapPageSettingsPageResult(
      {
        data: page,
        error: null,
      },
      "Failed to load current page",
    );

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected valid page payload to parse successfully");
    }

    expect(result.data.id).toBe(page.id);
    expect(result.data.slug).toBe(page.slug);
    expect(result.data.title).toBe(page.title);
    expect(result.data.nodes).toHaveLength(page.nodes.length);
  });
});
