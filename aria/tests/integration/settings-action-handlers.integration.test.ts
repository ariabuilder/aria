import { actionsSharedMocks } from "../mocks/actions-shared-state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActionsSharedAuthMockModule,
  resetActionsSharedAuthMocks,
} from "../mocks/actions-shared";
import {
  createActionContext,
  invokeActionHandler,
  type ActionWithHandler,
} from "../helpers/actionHandlers";
import type { SiteSettings } from "../../lib/storage/adapter";

const mockGetSiteSettings = vi.fn();
const mockSaveSiteSettings = vi.fn();
const mockTouchContentRevisionForAction = vi.fn();
const mockRegenerateGlobalCSSArtifacts = vi.fn();

vi.mock("../../lib/storage/getStorageAdapter", () => ({
  getStorageAdapterAsync: vi.fn(async () => ({
    getSiteSettings: mockGetSiteSettings,
    saveSiteSettings: mockSaveSiteSettings,
  })),
}));

vi.mock("../../actions/_shared", () =>
  createActionsSharedAuthMockModule(actionsSharedMocks),
);

vi.mock("../../lib/content-sync/mutations", () => ({
  touchContentRevisionForAction: mockTouchContentRevisionForAction,
}));

vi.mock("../../actions/styles", () => ({
  regenerateGlobalCSSArtifacts: mockRegenerateGlobalCSSArtifacts,
}));

describe("settings action handlers integration", () => {
  beforeEach(() => {
    resetActionsSharedAuthMocks(actionsSharedMocks);

    mockGetSiteSettings.mockResolvedValue({
      siteName: "Legacy Site",
      framework: "custom",
      breakpoints: [],
    } as Partial<SiteSettings>);
    mockSaveSiteSettings.mockResolvedValue(undefined);
    mockTouchContentRevisionForAction.mockResolvedValue(undefined);
    mockRegenerateGlobalCSSArtifacts.mockResolvedValue(undefined);
  });

  it("settings.update persists utilityEngine as the canonical site-settings field", async () => {
    const { settings } = await import("../../actions/settings");

    const result = await invokeActionHandler(
      settings.update as unknown as ActionWithHandler<
        {
          utilityEngine: string;
          siteName: string;
        },
        { success: boolean; data?: Record<string, unknown> }
      >,
      {
        utilityEngine: "unocss",
        siteName: "Canonical Site",
      },
      createActionContext(),
    );

    expect(result.success).toBe(true);
    expect(mockSaveSiteSettings).toHaveBeenCalledTimes(1);

    const saved = mockSaveSiteSettings.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(saved.siteName).toBe("Canonical Site");
    expect(saved.utilityEngine).toBe("unocss");
    expect("framework" in saved).toBe(false);

    if (result.success) {
      expect(result.data).toMatchObject({
        siteName: "Canonical Site",
        utilityEngine: "unocss",
      });
      expect("framework" in (result.data as Record<string, unknown>)).toBe(
        false,
      );
      expect("breakpoints" in (result.data as Record<string, unknown>)).toBe(
        false,
      );
    }
  });
});
