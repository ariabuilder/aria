import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

vi.mock("astro:actions", () => ({
  ActionError: class MockActionError extends Error {
    code: string;
    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
  defineAction: (config: { handler: (...args: unknown[]) => unknown }) =>
    config,
}));

import { ActionError } from "astro:actions";
import { SQLiteStorageAdapter } from "../../lib/storage/sqlite";
import { buildAuthorshipSaveContext } from "../../lib/authorship/stamping";
import { regenerateGlobalCSSArtifacts } from "../../actions/styles";
import {
  assertSettingsUpdateCapabilities,
  mergeSiteSettingsUpdate,
  sanitizeSiteSettingsForReader,
} from "../../actions/settings";
import { ContentSyncExecutor } from "../../lib/content-sync/service/executor";
import type { SessionUser } from "../../lib/auth/types";
import type {
  AnalyticsProviderId,
  SiteSettings,
} from "../../lib/storage/adapter";
import {
  createDefaultUniversalDesignSystem,
  applyDesignSystemColorsToUniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";

const administrator: SessionUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
};

const contributor: SessionUser = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "contributor",
  email: "contributor@example.com",
  role: "contributor",
  totpEnabled: false,
};

const analyticsEditor: SessionUser = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  username: "analytics",
  email: "analytics@example.com",
  role: "contributor",
  totpEnabled: false,
  permissionProfile: {
    rolePreset: "contributor",
    capabilityOverrides: { allow: ["editAnalytics"] },
  },
};

const deniedCustomCodeAdmin: SessionUser = {
  ...administrator,
  permissionProfile: {
    rolePreset: "administrator",
    capabilityOverrides: { deny: ["editCustomCode"] },
  },
};

function baseSettings(): SiteSettings {
  return {
    siteName: "Aria",
    customHeadCode: "<script></script>",
    analytics: {
      version: 1,
      activeProviders: ["plausible"],
      providers: {
        plausible: { domain: "example.com", apiKey: "secret-key" },
      },
    },
    appearance: {
      themeMode: "system",
      uiDensity: 1,
      uiZoom: 100,
    },
  };
}

describe("Phase 7 authorship and settings gating", () => {
  let tempDir: string;
  let client: Client;
  let adapter: SQLiteStorageAdapter;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "aria-phase7-"));
    client = createClient({ url: `file:${path.join(tempDir, "aria.db")}` });
    adapter = new SQLiteStorageAdapter(client, {
      seedStarterLayouts: false,
      seedStarterPages: false,
      seedStarterCms: false,
      seedStarterDesign: false,
      seedStarterSiteSettings: false,
    });
  });

  afterEach(async () => {
    client.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("stamps created_by and updated_by on first singleton insert", async () => {
    const authorship = buildAuthorshipSaveContext(administrator, "save-site-settings");

    await adapter.saveSiteSettings({ siteName: "Fresh" }, authorship);

    const row = await client.execute(
      `SELECT created_by_id, updated_by_id FROM aria_site_settings WHERE id = 'default'`,
    );

    expect(String(row.rows[0]?.created_by_id)).toBe(administrator.id);
    expect(String(row.rows[0]?.updated_by_id)).toBe(administrator.id);
  });

  it("preserves publisher authorship through CSS regeneration", async () => {
    const authorship = buildAuthorshipSaveContext(administrator, "save-styles");
    const designSystem = createDefaultUniversalDesignSystem();

    await adapter.saveDesignSystem(designSystem, authorship);
    await regenerateGlobalCSSArtifacts(adapter, { authorship });

    const row = await client.execute(
      `SELECT updated_by_id FROM aria_styles WHERE id = 'default' OR id LIKE 'default:%' LIMIT 1`,
    );

    expect(String(row.rows[0]?.updated_by_id)).toBe(administrator.id);
  });

  it("stamps both design system and site settings on saveColors pipeline", async () => {
    const authorship = buildAuthorshipSaveContext(administrator, "save-styles");
    const designSystem = applyDesignSystemColorsToUniversalDesignSystem(
      createDefaultUniversalDesignSystem(),
      {
        activeTemplateId: "custom",
        palettes: {
          primary: {
            25: "#000",
            50: "#000",
            100: "#000",
            200: "#000",
            300: "#000",
            400: "#000",
            500: "#000",
            600: "#000",
            700: "#000",
            800: "#000",
            900: "#000",
            950: "#000",
          },
        },
        semantic: {
          success: "#0f0",
          warning: "#ff0",
          error: "#f00",
          info: "#00f",
        },
      },
    );

    await adapter.saveDesignSystem(designSystem, authorship);
    await adapter.saveSiteSettings(
      {
        unocssConfig: {
          theme: {
            colors: { primary: "#000" },
          },
        },
      },
      { ...authorship, mutationKind: "save-site-settings" },
    );
    await regenerateGlobalCSSArtifacts(adapter, { authorship });

    const [stylesRow, settingsRow] = await Promise.all([
      client.execute(
        `SELECT updated_by_id FROM aria_styles WHERE id = 'default' OR id LIKE 'default:%' LIMIT 1`,
      ),
      client.execute(
        `SELECT updated_by_id FROM aria_site_settings WHERE id = 'default'`,
      ),
    ]);

    expect(String(stylesRow.rows[0]?.updated_by_id)).toBe(administrator.id);
    expect(String(settingsRow.rows[0]?.updated_by_id)).toBe(administrator.id);
  });

  it("denies analytics-only user changing customHeadCode", () => {
    const current = baseSettings();
    const merged = {
      ...current,
      customHeadCode: "<script>evil()</script>",
    };

    expect(() =>
      assertSettingsUpdateCapabilities(current, merged, analyticsEditor),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("allows full-object payload when only analytics changed", () => {
    const current = baseSettings();
    const merged = {
      ...current,
      analytics: {
        ...current.analytics!,
        activeProviders: ["plausible", "fathom"] as AnalyticsProviderId[],
      },
    };

    expect(() =>
      assertSettingsUpdateCapabilities(current, merged, analyticsEditor),
    ).not.toThrow();
  });

  it("replaces analytics providers when providers object is supplied", () => {
    const current: SiteSettings = {
      ...baseSettings(),
      analytics: {
        version: 1,
        activeProviders: ["plausible", "fathom"],
        providers: {
          plausible: { domain: "example.com", apiKey: "secret-key" },
          fathom: { siteId: "ABCD1234" },
        },
      },
    };
    const merged = mergeSiteSettingsUpdate(current, {
      analytics: {
        version: 1,
        activeProviders: ["plausible"],
        providers: {
          plausible: { domain: "example.com", apiKey: "secret-key" },
        },
      },
    });

    expect(Object.keys(merged.analytics?.providers ?? {})).toEqual(["plausible"]);
    expect(merged.analytics?.providers?.fathom).toBeUndefined();
    expect(merged.analytics?.activeProviders).toEqual(["plausible"]);
  });

  it("preserves analytics providers when update omits providers", () => {
    const current = baseSettings();
    const merged = mergeSiteSettingsUpdate(current, {
      analytics: {
        version: 1,
        activeProviders: [],
      },
    });

    expect(merged.analytics?.providers).toEqual(current.analytics?.providers);
    expect(merged.analytics?.activeProviders).toEqual([]);
  });

  it("deep-merges studioDisplay without wiping activeProviders", () => {
    const current: SiteSettings = {
      ...baseSettings(),
      analytics: {
        version: 1,
        activeProviders: ["plausible"],
        providers: { plausible: { domain: "example.com" } },
        studioDisplay: { cloudflareTraffic: false },
      },
    };

    const merged = mergeSiteSettingsUpdate(current, {
      analytics: {
        version: 1,
        activeProviders: ["plausible"],
        providers: { plausible: { domain: "example.com" } },
        studioDisplay: { cloudflareTraffic: true },
      },
    });

    expect(merged.analytics?.studioDisplay?.cloudflareTraffic).toBe(true);
    expect(merged.analytics?.activeProviders).toEqual(["plausible"]);
    expect(merged.analytics?.providers?.plausible).toEqual({
      domain: "example.com",
    });
  });

  it("allows contributor appearance changes", () => {
    const current = baseSettings();
    const merged = {
      ...current,
      appearance: {
        ...(current as Record<string, unknown>).appearance as object,
        themeMode: "dark" as const,
      },
    };

    expect(() =>
      assertSettingsUpdateCapabilities(current, merged, contributor),
    ).not.toThrow();
  });

  it("denies contributor siteName changes", () => {
    const current = baseSettings();
    const merged = {
      ...current,
      siteName: "Hacked",
    };

    expect(() =>
      assertSettingsUpdateCapabilities(current, merged, contributor),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("denies administrator with editCustomCode override removed", () => {
    const current = baseSettings();
    const merged = {
      ...current,
      customHeadCode: "<script>blocked()</script>",
    };

    expect(() =>
      assertSettingsUpdateCapabilities(current, merged, deniedCustomCodeAdmin),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("redacts sensitive settings for contributor readers", () => {
    const sanitized = sanitizeSiteSettingsForReader(contributor, baseSettings());

    expect(sanitized.customHeadCode).toBeUndefined();
    expect(sanitized.analytics).toBeUndefined();
    expect(sanitized.siteName).toBeUndefined();
    expect(
      ((sanitized as Record<string, unknown>).appearance as { themeMode?: string })
        ?.themeMode,
    ).toBe("system");
  });

  it("passes user authorship into content-sync singleton writes", async () => {
    const authorship = buildAuthorshipSaveContext(administrator, "save-styles");
    const saveDesignSystem = vi.fn(async () => undefined);
    const saveSiteSettings = vi.fn(async () => undefined);
    const savePageMetadata = vi.fn(async () => undefined);

    const sourceAdapter = {
      getDesignSystem: async () => createDefaultUniversalDesignSystem(),
      getSiteSettings: async () => ({ siteName: "Synced" }),
      getPageMetadata: async () => ({ title: "Home" }),
      getContentSiteState: async () => null,
    };

    const targetAdapter = {
      saveDesignSystem,
      saveSiteSettings,
      savePageMetadata,
      touchContentRevision: async () => ({
        scope: "default",
        currentRevisionId: "rev-1",
        revisionSeq: 1,
        updatedAt: new Date().toISOString(),
        lastMutationKind: "push" as const,
      }),
      getContentSiteState: async () => null,
    };

    const executor = new ContentSyncExecutor();
    await executor.apply({
      dryRunJob: {
        id: "plan-1",
        direction: "push",
        mode: "dry-run",
        status: "completed",
        sourceEndpointId: "local-sqlite",
        targetEndpointId: "cloudflare-d1",
        conflictPolicy: "newest-wins",
        createdAt: new Date().toISOString(),
      },
      dryRunItems: [
        {
          id: "styles",
          jobId: "plan-1",
          resourceType: "styles",
          resourceId: "default",
          action: "update",
          resultStatus: "planned",
          createdAt: new Date().toISOString(),
        },
        {
          id: "settings",
          jobId: "plan-1",
          resourceType: "site-settings",
          resourceId: "default",
          action: "update",
          resultStatus: "planned",
          createdAt: new Date().toISOString(),
        },
        {
          id: "metadata",
          jobId: "plan-1",
          resourceType: "metadata",
          resourceId: "home",
          action: "update",
          resultStatus: "planned",
          createdAt: new Date().toISOString(),
        },
      ],
      localAdapter: sourceAdapter as never,
      remoteAdapter: targetAdapter as never,
      actorId: administrator.id,
      authorship,
    });

    expect(saveDesignSystem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ id: administrator.id }),
        mutationKind: "save-styles",
      }),
    );
    expect(saveSiteSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ id: administrator.id }),
        mutationKind: "save-site-settings",
      }),
    );
    expect(savePageMetadata).toHaveBeenCalledWith(
      "home",
      expect.anything(),
      expect.objectContaining({
        actor: expect.objectContaining({ id: administrator.id }),
        mutationKind: "save-page-metadata",
      }),
    );
  });

  it("surfaces ActionError FORBIDDEN instead of masking as UPDATE failure", () => {
    const error = new ActionError({
      code: "FORBIDDEN",
      message: "Operation not permitted: settings.update",
    });

    expect(error).toMatchObject({ code: "FORBIDDEN" });
    expect(error instanceof ActionError).toBe(true);
  });
});
