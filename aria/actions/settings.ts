/**
 * Astro actions for managing site-wide settings
 * including appearance, utility-engine configuration, and more.
 */

import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { touchContentRevisionForAction } from "../lib/content-sync/mutations";
import { AppearanceStorageSchema } from "../lib/schemas/appearance";
import { ComponentGroupingStateSchema } from "../lib/schemas/componentGrouping";
import { MediaGroupingStateSchema } from "../lib/schemas/mediaGrouping";
import {
  ANALYTICS_PROVIDER_IDS,
  getSiteSettingsUtilityEngine,
  normalizeSiteSettings,
  type SiteSettings,
  type AnalyticsSettings,
} from "../lib/storage/adapter";
import type { Capability, SessionUser } from "../lib/auth/types";
import { resolveEffectiveCapabilities } from "../lib/auth/types";
import { resolveUserPermissionProfile } from "../lib/authorship/stamping";
import {
  requireAuth,
  requireOperation,
  resolveAuthorizedMutation,
  type AuthorshipSaveContext,
} from "./_shared";
import { persistSiteSettings } from "./_designSystemPersist";
import { log as baseLog } from "../lib/utils/logger";
import { normalizeIconSettingsInput } from "../lib/icons/action-normalizers";
import {
  DiscoverySettingsSchema,
  mergeDiscoverySettings,
} from "../lib/crawl/schemas";
import { validateDiscoverySettings } from "../lib/crawl/validateCustomArtifacts";
import {
  AgentSettingsSchema,
  AgentSettingsFieldsSchema,
  AgentSettingsPatchSchema,
  isInferenceConfigPatch,
  mergeAgentSettings,
  RemoveAgentProviderInputSchema,
  RemoveInferenceProviderInputSchema,
  buildRemoveInferenceProviderPatch,
  UpdateAgentProviderInputSchema,
} from "../lib/agent/settings";
import { getAuthAdapterAsync } from "../lib/auth/getAuthAdapter";
import { resolveRuntimePlatform } from "../admin/features/Agent/lib/platform";
import { AdapterInfoSchema } from "../lib/storage/adapterMetricsSchemas";
import { buildSystemVersionReport } from "../lib/system/metadata";
import {
  ContentLocalizationSettingsSchema,
  normalizeContentLocalization,
} from "../lib/localization/contentLocale";
import {
  buildLocalePolicyInvalidationJobs,
  findLocaleEnableRouteConflicts,
  findLocaleRemovalConflicts,
} from "../lib/localization/localePolicySafety";
import { JsonObjectSchema, JsonValueSchema } from "../lib/schemas/json";
import { isValidTimeZone } from "../lib/datetime/timeZone";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Settings][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const SITE_IDENTITY_KEYS = [
  "siteName",
  "timeZone",
  "siteDescription",
  "siteUrl",
  "favicon",
  "seoTitle",
  "seoDescription",
  "seoKeywords",
  "ogImage",
  "twitterCard",
] as const satisfies readonly (keyof SiteSettings)[];

const UTILITY_STYLE_KEYS = [
  "utilityEngine",
  "unocssConfig",
  "customFrameworkURL",
  "darkMode",
] as const satisfies readonly (keyof SiteSettings)[];

const CUSTOM_CODE_KEYS = [
  "customHeadCode",
  "customBodyCode",
  "customFooterCode",
] as const satisfies readonly (keyof SiteSettings)[];

const DOMAIN_KEYS = [
  "customDomain",
  "sslEnabled",
  "forceHttps",
] as const satisfies readonly (keyof SiteSettings)[];

function normalizeDomainValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeDomainValue);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const nested = record[key];
      if (nested !== undefined) {
        normalized[key] = normalizeDomainValue(nested);
      }
    }
    return normalized;
  }

  return value;
}

function domainChanged(current: unknown, merged: unknown): boolean {
  return (
    JSON.stringify(normalizeDomainValue(current)) !==
    JSON.stringify(normalizeDomainValue(merged))
  );
}

function hasEffectiveCapability(
  user: SessionUser,
  capability: Capability,
): boolean {
  const effective = resolveEffectiveCapabilities(
    resolveUserPermissionProfile(user),
  );
  return effective.includes(capability);
}

function assertCapability(user: SessionUser, capability: Capability): void {
  if (!hasEffectiveCapability(user, capability)) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: `Requires ${capability} capability`,
    });
  }
}

function assertAnyCapability(
  user: SessionUser,
  capabilities: readonly Capability[],
): void {
  if (
    !capabilities.some((capability) => hasEffectiveCapability(user, capability))
  ) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: `Requires one of: ${capabilities.join(", ")}`,
    });
  }
}

function extractUnoExecutableConfig(
  config: SiteSettings["unocssConfig"] | undefined,
): Pick<
  NonNullable<SiteSettings["unocssConfig"]>,
  "rules" | "shortcuts" | "safelist" | "presets" | "blocklist"
> {
  return {
    rules: config?.rules,
    shortcuts: config?.shortcuts,
    safelist: config?.safelist,
    presets: config?.presets,
    blocklist: config?.blocklist,
  };
}

function extractUnoThemeConfig(
  config: SiteSettings["unocssConfig"] | undefined,
): SiteSettings["unocssConfig"] | undefined {
  if (!config?.theme) {
    return undefined;
  }
  return { theme: config.theme };
}

type LegacyAppearance = z.infer<typeof AppearanceStorageSchema>;

function readLegacyAppearance(
  settings: SiteSettings,
): LegacyAppearance | undefined {
  return (settings as Record<string, unknown>).appearance as
    | LegacyAppearance
    | undefined;
}

export function assertSettingsUpdateCapabilities(
  current: SiteSettings,
  merged: SiteSettings,
  user: SessionUser,
): void {
  if (domainChanged(current.analytics, merged.analytics)) {
    assertCapability(user, "editAnalytics");
  }

  for (const key of CUSTOM_CODE_KEYS) {
    if (domainChanged(current[key], merged[key])) {
      assertCapability(user, "editCustomCode");
    }
  }

  for (const key of DOMAIN_KEYS) {
    if (domainChanged(current[key], merged[key])) {
      assertCapability(user, "editDomains");
    }
  }

  if (
    domainChanged(readLegacyAppearance(current), readLegacyAppearance(merged))
  ) {
    assertAnyCapability(user, ["editStudioPreferences", "editSiteSettings"]);
  }

  if (
    domainChanged(
      current.studio?.componentGrouping,
      merged.studio?.componentGrouping,
    )
  ) {
    assertCapability(user, "editSiteSettings");
  }

  if (domainChanged(current.icons, merged.icons)) {
    assertCapability(user, "editSiteSettings");
  }

  if (domainChanged(current.localization, merged.localization)) {
    assertCapability(user, "editSiteSettings");
  }

  if (domainChanged(current.discovery, merged.discovery)) {
    assertCapability(user, "editDiscoverySettings");
  }

  for (const key of SITE_IDENTITY_KEYS) {
    if (domainChanged(current[key], merged[key])) {
      assertCapability(user, "editSiteSettings");
    }
  }

  for (const key of UTILITY_STYLE_KEYS) {
    if (key === "unocssConfig") {
      continue;
    }
    if (domainChanged(current[key], merged[key])) {
      assertCapability(user, "editSiteSettings");
    }
  }

  if (
    domainChanged(
      extractUnoThemeConfig(current.unocssConfig),
      extractUnoThemeConfig(merged.unocssConfig),
    )
  ) {
    assertCapability(user, "editSiteSettings");
  }

  if (
    domainChanged(
      extractUnoExecutableConfig(current.unocssConfig),
      extractUnoExecutableConfig(merged.unocssConfig),
    )
  ) {
    assertCapability(user, "editCustomCode");
  }
}

export function sanitizeSiteSettingsForReader(
  user: SessionUser,
  settings: SiteSettings | null | undefined,
): SiteSettings {
  const normalized = normalizeSiteSettings(settings ?? {}) as SiteSettings;
  const {
    breakpoints: _breakpoints,
    viewports: _viewports,
    viewportBreakpointMap: _viewportBreakpointMap,
    ...sanitized
  } = normalized as SiteSettings & {
    breakpoints?: unknown;
    viewports?: unknown;
    viewportBreakpointMap?: unknown;
  };

  const canEditSiteSettings = hasEffectiveCapability(user, "editSiteSettings");
  const canEditAnalytics = hasEffectiveCapability(user, "editAnalytics");
  const canEditCustomCode = hasEffectiveCapability(user, "editCustomCode");
  const canEditDomains = hasEffectiveCapability(user, "editDomains");
  const canEditStudioPreferences = hasEffectiveCapability(
    user,
    "editStudioPreferences",
  );

  if (!canEditSiteSettings && !canEditStudioPreferences) {
    delete (sanitized as Record<string, unknown>).appearance;
  }

  if (!canEditStudioPreferences) {
    delete sanitized.studio;
  }

  if (!canEditSiteSettings) {
    for (const key of SITE_IDENTITY_KEYS) {
      delete sanitized[key];
    }
    delete sanitized.icons;
    delete sanitized.system;
    delete sanitized.utilityEngine;
    delete sanitized.unocssConfig;
    delete sanitized.customFrameworkURL;
    delete sanitized.darkMode;
    delete sanitized.styleRevision;
  }

  if (!canEditAnalytics) {
    const studioDisplay = sanitized.analytics?.studioDisplay;
    delete sanitized.analytics;
    if (studioDisplay) {
      sanitized.analytics = {
        version: 1,
        activeProviders: [],
        providers: {},
        studioDisplay,
      };
    }
  }

  if (!canEditCustomCode) {
    for (const key of CUSTOM_CODE_KEYS) {
      delete sanitized[key];
    }
  }

  if (!canEditDomains) {
    for (const key of DOMAIN_KEYS) {
      delete sanitized[key];
    }
  }

  const canEditDiscovery = hasEffectiveCapability(
    user,
    "editDiscoverySettings",
  );
  const canViewAgent = hasEffectiveCapability(user, "viewAgentSettings");
  const canEditAgent = hasEffectiveCapability(user, "editAgentSettings");
  if (!canEditDiscovery && sanitized.discovery) {
    sanitized.discovery = {
      sitemapMode: sanitized.discovery.sitemapMode,
      robotsMode: sanitized.discovery.robotsMode,
      llmsMode: sanitized.discovery.llmsMode,
      discourageSearchEngines: sanitized.discovery.discourageSearchEngines,
      includeSitemapInRobots: sanitized.discovery.includeSitemapInRobots,
      trailingSlashPolicy: sanitized.discovery.trailingSlashPolicy,
      aiBotPolicy: sanitized.discovery.aiBotPolicy,
      sitemapPingOnPublish: sanitized.discovery.sitemapPingOnPublish,
    };
  }

  if (!canViewAgent) {
    delete sanitized.agent;
  } else if (!canEditAgent && sanitized.agent) {
    sanitized.agent = AgentSettingsSchema.parse(sanitized.agent);
  }

  return sanitized;
}

function sanitizeSiteSettingsForResponse(
  siteSettings: SiteSettings | null | undefined,
): SiteSettings {
  const {
    breakpoints: _breakpoints,
    viewports: _viewports,
    viewportBreakpointMap: _viewportBreakpointMap,
    ...sanitized
  } = (siteSettings ?? {}) as SiteSettings & {
    breakpoints?: unknown;
    viewports?: unknown;
    viewportBreakpointMap?: unknown;
  };

  return sanitized;
}

/** Partial site-settings patch; nested analytics allows omitting unchanged fields. */
export type SiteSettingsUpdateInput = Omit<
  Partial<SiteSettings>,
  "analytics"
> & {
  analytics?: Partial<AnalyticsSettings>;
};

export function mergeSiteSettingsUpdate(
  currentSettings: SiteSettings,
  input: SiteSettingsUpdateInput,
): SiteSettings {
  const {
    utilityEngine,
    analytics,
    icons,
    studio,
    discovery,
    localization,
    ...rest
  } = input;
  const appearancePatch = (input as Record<string, unknown>).appearance as
    | LegacyAppearance
    | undefined;
  const currentIconPacks = currentSettings.icons?.enabledPacks ?? {};
  const nextIconPacks = icons?.enabledPacks ?? {};
  const currentDefaultPack = currentSettings.icons?.defaultPack;
  const requestedDefaultPack = icons?.defaultPack;
  const mergedIconSettings =
    icons !== undefined
      ? {
          enabledPacks: {
            lucide: nextIconPacks.lucide ?? currentIconPacks.lucide ?? true,
            "coreui-brands":
              nextIconPacks["coreui-brands"] ??
              currentIconPacks["coreui-brands"] ??
              true,
          },
          defaultPack:
            requestedDefaultPack ??
            (currentDefaultPack === "lucide" ||
            currentDefaultPack === "coreui-brands"
              ? currentDefaultPack
              : "lucide"),
        }
      : undefined;

  return normalizeSiteSettings({
    ...currentSettings,
    ...rest,
    ...(utilityEngine ? { utilityEngine } : {}),
    ...(appearancePatch !== undefined
      ? {
          appearance: {
            ...readLegacyAppearance(currentSettings),
            ...appearancePatch,
          },
        }
      : {}),
    ...(analytics !== undefined
      ? {
          analytics: {
            ...currentSettings.analytics,
            ...analytics,
            providers:
              analytics.providers !== undefined
                ? analytics.providers
                : (currentSettings.analytics?.providers ?? {}),
            studioDisplay:
              analytics.studioDisplay !== undefined
                ? {
                    ...currentSettings.analytics?.studioDisplay,
                    ...analytics.studioDisplay,
                  }
                : currentSettings.analytics?.studioDisplay,
          },
        }
      : {}),
    ...(icons !== undefined
      ? {
          icons: mergedIconSettings,
        }
      : {}),
    ...(studio !== undefined
      ? {
          studio: {
            ...currentSettings.studio,
            ...studio,
            ...(studio.componentGrouping !== undefined
              ? {
                  componentGrouping: {
                    ...currentSettings.studio?.componentGrouping,
                    ...studio.componentGrouping,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(discovery !== undefined
      ? {
          discovery: mergeDiscoverySettings(
            currentSettings.discovery,
            discovery,
          ),
        }
      : {}),
    ...(localization !== undefined
      ? {
          localization: {
            content: ContentLocalizationSettingsSchema.parse(
              localization.content,
            ),
          },
        }
      : {}),
    updated_at: Date.now(),
  } as SiteSettings) as SiteSettings;
}

export function isStyleAffectingSettingsInput(input: Partial<SiteSettings>): boolean {
  return (
    input.utilityEngine !== undefined ||
    input.unocssConfig !== undefined ||
    input.customFrameworkURL !== undefined ||
    input.darkMode !== undefined
  );
}

export async function refreshRenderStylesAfterSettingsMutation(
  adapter: Awaited<ReturnType<typeof getStorageAdapterAsync>>,
  mutationTarget: string,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  try {
    const stylesModule = await import("./styles");
    await stylesModule.regenerateGlobalCSSArtifacts(adapter, {
      bumpStyleRevision: true,
      invalidatePageRenderArtifacts: true,
      authorship,
    });
  } catch (error) {
    log("warn", "Render style refresh failed after settings mutation", {
      mutationTarget,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const AppearanceSchema = AppearanceStorageSchema;

const StudioComponentGroupingSchema = ComponentGroupingStateSchema;
const StudioMediaGroupingSchema = MediaGroupingStateSchema;

/**
 * Shared Studio site configuration under `SiteSettings.studio`.
 * `componentGrouping` is site-wide component library taxonomy (manager-curated).
 */
const StudioPreferencesSchema = z.object({
  componentGrouping: StudioComponentGroupingSchema.optional(),
  mediaGrouping: StudioMediaGroupingSchema.optional(),
});

const IconPackKeySchema = z.enum(["lucide", "coreui-brands"]);

const IconEnabledPacksSchema = z.object({
  lucide: z.boolean().optional(),
  "coreui-brands": z.boolean().optional(),
});

const IconSettingsSchema = z.object({
  enabledPacks: IconEnabledPacksSchema.optional(),
  defaultPack: IconPackKeySchema.or(z.literal("none")).optional(),
});

const LocalizationSettingsSchema = z
  .object({
    content: ContentLocalizationSettingsSchema,
  })
  .strict();

const AnalyticsProviderIdSchema = z.enum(ANALYTICS_PROVIDER_IDS);

const AnalyticsProviderFieldsSchema = z.record(z.string(), z.string());

const analyticsProviderShape = Object.fromEntries(
  ANALYTICS_PROVIDER_IDS.map((providerId) => [
    providerId,
    AnalyticsProviderFieldsSchema.optional(),
  ]),
) as Record<
  (typeof ANALYTICS_PROVIDER_IDS)[number],
  ReturnType<typeof AnalyticsProviderFieldsSchema.optional>
>;

const AnalyticsProvidersSchema = z.object(analyticsProviderShape).strict();

const AnalyticsStudioDisplaySchema = z.object({
  cloudflareTraffic: z.boolean().optional(),
});

const AnalyticsSettingsSchema = z.object({
  version: z.literal(1),
  activeProviders: z.array(AnalyticsProviderIdSchema),
  providers: AnalyticsProvidersSchema,
  studioDisplay: AnalyticsStudioDisplaySchema.optional(),
});

const UtilityEngineSchema = z.enum(["unocss", "custom"]);

const RuntimeTargetSchema = z.enum(["node", "cloudflare"]);

const CompilerMetadataSchema = z.object({
  aria: z.object({
    version: z.string(),
  }),
  astro: z.object({
    version: z.string(),
    major: z.number(),
  }),
  runtime: RuntimeTargetSchema,
  storageSchemaVersion: z.string(),
  capturedAt: z.string(),
});

const ProjectSystemMetadataSchema = z.object({
  projectCreatedAt: z.string(),
  createdWith: CompilerMetadataSchema,
});

const UnocssThemeSchema = z.object({
  colors: z.record(z.string(), JsonValueSchema).optional(),
  fontFamily: z.record(z.string(), z.array(z.string())).optional(),
  fontSize: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.string()).optional(),
  borderRadius: z.record(z.string(), z.string()).optional(),
});

const UnocssConfigSchema = z.object({
  theme: UnocssThemeSchema.optional(),
  shortcuts: z.record(z.string(), z.string()).optional(),
  rules: z.array(z.tuple([z.string(), JsonObjectSchema])).optional(),
  safelist: z.array(z.string()).optional(),
  presets: z.array(z.string()).optional(),
  blocklist: z.array(z.string()).optional(),
});

/**
 * Full SiteSettings schema matching the interface exactly
 */
const SiteSettingsSchema = z.object({
  siteName: z.string().optional(),
  timeZone: z
    .string()
    .refine(isValidTimeZone, "Time zone must be a valid IANA time zone")
    .optional(),
  onboarding: z
    .object({
      version: z.literal(1),
      status: z.enum(["unstarted", "named", "installing", "complete"]),
      foundation: z.enum(["blank", "starter-content"]).optional(),
      completedSteps: z.array(z.string()).optional(),
      completedAt: z.iso.datetime().optional(),
    })
    .optional(),
  siteDescription: z.string().optional(),
  siteUrl: z.string().optional(),
  favicon: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.string().optional(),
  ogImage: z.string().optional(),
  twitterCard: z.string().optional(),
  customDomain: z.string().optional(),
  sslEnabled: z.boolean().optional(),
  forceHttps: z.boolean().optional(),
  analytics: AnalyticsSettingsSchema.optional(),
  customHeadCode: z.string().optional(),
  customBodyCode: z.string().optional(),
  customFooterCode: z.string().optional(),
  utilityEngine: UtilityEngineSchema.optional(),
  unocssConfig: UnocssConfigSchema.optional(),
  customFrameworkURL: z.string().optional(),
  darkMode: z.enum(["media", "class", "disabled"]).optional(),
  appearance: AppearanceSchema.optional(),
  studio: StudioPreferencesSchema.optional(),
  icons: IconSettingsSchema.optional(),
  localization: LocalizationSettingsSchema.optional(),
  discovery: DiscoverySettingsSchema.optional(),
  agent: AgentSettingsFieldsSchema.optional(),
  system: ProjectSystemMetadataSchema.optional(),
  updated_at: z.number().optional(),
});

const SiteSettingsUpdateSchema = SiteSettingsSchema.omit({
  system: true,
}).partial();

export const settings = {
  /**
   * Get site settings
   *
   * Returns all site settings including appearance,
   * utility-engine configuration, and UnoCSS theme settings.
   *
   * @returns Current site settings
   */
  get: defineAction({
    accept: "json",
    handler: async (_, context) => {
      const user = await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const siteSettings = await adapter.getSiteSettings();

        log("info", "Site settings loaded", {
          utilityEngine: getSiteSettingsUtilityEngine(siteSettings),
        });

        return {
          success: true,
          data: sanitizeSiteSettingsForReader(user, siteSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to get settings", { error });
        return {
          success: false,
          error: {
            code: "GET_SETTINGS_FAILED",
            message:
              error instanceof Error ? error.message : "Failed to get settings",
          },
        };
      }
    },
  }),

  system: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const [siteSettings, platformInfo] = await Promise.all([
          adapter.getSiteSettings(),
          typeof adapter.getAdapterInfo === "function"
            ? adapter.getAdapterInfo()
            : Promise.resolve(null),
        ]);
        const versions = buildSystemVersionReport();

        return {
          success: true as const,
          data: {
            project: siteSettings?.system ?? null,
            current: versions.current,
            packages: versions.packages,
            acknowledgements: versions.acknowledgements,
            platform: platformInfo
              ? AdapterInfoSchema.parse(platformInfo)
              : null,
          },
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to get system settings", { error });
        return {
          success: false as const,
          error: {
            code: "GET_SYSTEM_SETTINGS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to get system settings",
          },
        };
      }
    },
  }),

  /**
   * Update site settings
   *
   * Merges provided settings with current settings and saves.
   * Supports partial updates - only provided fields are updated.
   *
   * @returns Updated settings
   */
  update: defineAction({
    accept: "json",
    input: SiteSettingsUpdateSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "settings.update",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = normalizeSiteSettings(
          (await adapter.getSiteSettings()) ?? {},
        ) as SiteSettings;
        const updatedSettings = mergeSiteSettingsUpdate(
          currentSettings,
          input as Partial<SiteSettings>,
        );
        const currentLocalization = normalizeContentLocalization(
          currentSettings.localization?.content,
        );
        const updatedLocalization = normalizeContentLocalization(
          updatedSettings.localization?.content,
        );
        const localeRemovalConflicts = await findLocaleRemovalConflicts({
          adapter,
          current: currentLocalization,
          next: updatedLocalization,
        });
        if (localeRemovalConflicts.length > 0) {
          throw new ActionError({
            code: "CONFLICT",
            message: localeRemovalConflicts.join(" "),
          });
        }
        const localeRouteConflicts = await findLocaleEnableRouteConflicts({
          adapter,
          current: currentLocalization,
          next: updatedLocalization,
        });
        if (localeRouteConflicts.length > 0) {
          throw new ActionError({
            code: "CONFLICT",
            message: localeRouteConflicts.join(" "),
          });
        }

        if (
          currentSettings.localization?.content.defaultLocale &&
          updatedSettings.localization?.content.defaultLocale !==
            currentSettings.localization.content.defaultLocale &&
          (await adapter.hasSiteLocalizationRecords())
        ) {
          throw new ActionError({
            code: "CONFLICT",
            message:
              "The default content locale is locked once page or layout translations exist.",
          });
        }

        assertSettingsUpdateCapabilities(
          currentSettings,
          updatedSettings,
          user,
        );

        const localePolicyInvalidationJobs =
          await buildLocalePolicyInvalidationJobs({
            adapter,
            current: currentLocalization,
            next: updatedLocalization,
          });
        await persistSiteSettings(
          adapter,
          updatedSettings,
          authorship,
          localePolicyInvalidationJobs,
        );
        if (isStyleAffectingSettingsInput(input as Partial<SiteSettings>)) {
          await refreshRenderStylesAfterSettingsMutation(
            adapter,
            "settings",
            authorship,
          );
        }
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "default",
          },
          context,
        );

        log("info", "Site settings updated", {
          utilityEngine: getSiteSettingsUtilityEngine(updatedSettings),
        });

        return {
          success: true,
          data: sanitizeSiteSettingsForResponse(updatedSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update settings", { error });
        return {
          success: false,
          error: {
            code: "UPDATE_SETTINGS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update settings",
          },
        };
      }
    },
  }),

  updateDiscovery: defineAction({
    accept: "json",
    input: DiscoverySettingsSchema.partial(),
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "settings.updateDiscovery",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = normalizeSiteSettings(
          (await adapter.getSiteSettings()) ?? {},
        ) as SiteSettings;

        const mergedDiscovery = mergeDiscoverySettings(
          currentSettings.discovery,
          input,
        );

        const validationErrors = validateDiscoverySettings(mergedDiscovery, {
          siteUrl: currentSettings.siteUrl,
        });
        if (validationErrors.length > 0) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: validationErrors.map((error) => error.message).join(" "),
          });
        }
        const updatedSettings = mergeSiteSettingsUpdate(currentSettings, {
          discovery: mergedDiscovery,
        });

        assertCapability(user, "editDiscoverySettings");

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await adapter.appendSettingsAuditEntry({
          category: "discovery",
          action: "update",
          actorId: authorship.actor.id,
          actorUsername: authorship.actor.username,
          summary: "Updated discovery settings",
          payload: { changedKeys: Object.keys(input) },
        });
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "discovery",
          },
          context,
        );

        return {
          success: true as const,
          data: sanitizeSiteSettingsForResponse(updatedSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update discovery settings", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_DISCOVERY_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update discovery settings",
          },
        };
      }
    },
  }),

  updateAgent: defineAction({
    accept: "json",
    input: AgentSettingsPatchSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "settings.updateAgent",
        "save-site-settings",
      );

      try {
        assertCapability(user, "editAgentSettings");
        const adapter = await getStorageAdapterAsync(context.locals);
        const platform = await resolveRuntimePlatform(context.locals);
        const currentSettings = normalizeSiteSettings(
          (await adapter.getSiteSettings()) ?? {},
        ) as SiteSettings;
        const mergedAgent = mergeAgentSettings(currentSettings.agent, input);
        const workersAiInst = Object.values(
          mergedAgent.inference.providerInstances,
        ).find((inst) => inst.backend === "workers_ai");
        if (
          platform === "local" &&
          isInferenceConfigPatch(input) &&
          workersAiInst?.enabled
        ) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Workers AI is unavailable on local platform",
          });
        }
        if (
          platform === "cloudflare" &&
          isInferenceConfigPatch(input) &&
          workersAiInst?.enabled &&
          (!workersAiInst.defaultModelId?.trim() ||
            workersAiInst.enabledModelIds.length === 0)
        ) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message:
              "Workers AI requires at least one enabled model when active",
          });
        }
        const updatedSettings = mergeSiteSettingsUpdate(currentSettings, {
          agent: mergedAgent,
        });

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await adapter.appendSettingsAuditEntry({
          category: "agent",
          action: "update",
          actorId: authorship.actor.id,
          actorUsername: authorship.actor.username,
          summary: "Updated agent settings",
          payload: { changedKeys: Object.keys(input) },
        });
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "agent",
          },
          context,
        );

        return {
          success: true as const,
          data: sanitizeSiteSettingsForResponse(updatedSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update agent settings", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_AGENT_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update agent settings",
          },
        };
      }
    },
  }),

  updateAgentProvider: defineAction({
    accept: "json",
    input: UpdateAgentProviderInputSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "settings.updateAgentProvider",
        "save-site-settings",
      );

      try {
        assertCapability(user, "editAgentSettings");
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const { saveProviderCredentials } =
          await import("../admin/features/Agent/lib/inference/byokStore");
        await saveProviderCredentials(authAdapter, input);

        return {
          success: true as const,
          data: {
            configured: true,
            provider: input.provider,
          },
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to update agent provider", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_AGENT_PROVIDER_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update agent provider",
          },
        };
      }
    },
  }),

  removeAgentProvider: defineAction({
    accept: "json",
    input: RemoveAgentProviderInputSchema,
    handler: async (input, context) => {
      const { user } = await resolveAuthorizedMutation(
        context,
        "settings.removeAgentProvider",
        "save-site-settings",
      );

      try {
        assertCapability(user, "editAgentSettings");
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const { clearProviderCredentials } =
          await import("../admin/features/Agent/lib/inference/byokStore");
        await clearProviderCredentials(authAdapter, input.provider);

        return {
          success: true as const,
          data: {
            configured: false,
            provider: input.provider,
          },
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to remove agent provider credentials", { error });
        return {
          success: false as const,
          error: {
            code: "REMOVE_AGENT_PROVIDER_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to remove agent provider credentials",
          },
        };
      }
    },
  }),

  removeInferenceProvider: defineAction({
    accept: "json",
    input: RemoveInferenceProviderInputSchema,
    handler: async (input, context) => {
      const { user, authorship } = await resolveAuthorizedMutation(
        context,
        "settings.removeInferenceProvider",
        "save-site-settings",
      );

      try {
        assertCapability(user, "editAgentSettings");
        const adapter = await getStorageAdapterAsync(context.locals);
        const authAdapter = await getAuthAdapterAsync(context.locals);
        const currentSettings = normalizeSiteSettings(
          (await adapter.getSiteSettings()) ?? {},
        ) as SiteSettings;

        const { isCredentialBackend } =
          await import("../admin/features/Agent/lib/inferenceProviders");
        if (isCredentialBackend(input.providerId)) {
          const { clearProviderCredentials } =
            await import("../admin/features/Agent/lib/inference/byokStore");
          await clearProviderCredentials(authAdapter, input.providerId);
        }

        const mergedAgent = mergeAgentSettings(
          currentSettings.agent,
          buildRemoveInferenceProviderPatch(
            mergeAgentSettings(currentSettings.agent, {}),
            input.providerId,
          ),
        );
        const updatedSettings = mergeSiteSettingsUpdate(currentSettings, {
          agent: mergedAgent,
        });

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await adapter.appendSettingsAuditEntry({
          category: "agent",
          action: "update",
          actorId: authorship.actor.id,
          actorUsername: authorship.actor.username,
          summary: `Removed inference provider ${input.providerId}`,
          payload: { providerId: input.providerId },
        });
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "agent",
          },
          context,
        );

        return {
          success: true as const,
          data: sanitizeSiteSettingsForResponse(updatedSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to remove inference provider", { error });
        return {
          success: false as const,
          error: {
            code: "REMOVE_INFERENCE_PROVIDER_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to remove inference provider",
          },
        };
      }
    },
  }),

  /**
   * Update appearance settings only
   *
   * Convenience action for updating just UI appearance settings.
   *
   * @param input - Appearance settings to update
   * @returns Updated appearance settings
   */
  updateAppearance: defineAction({
    accept: "json",
    input: z.object({}).strict(),
    handler: async (_, context) => {
      await requireAuth(context);

      throw new ActionError({
        code: "BAD_REQUEST",
        message:
          "Site appearance settings are deprecated. Use auth.updatePreferences instead.",
      });
    },
  }),

  /**
   * Update icon settings only
   *
   * Persists enabled pack map and default pack with explicit
   * icon-specific validation.
   */
  updateIcons: defineAction({
    accept: "json",
    input: IconSettingsSchema,
    handler: async (input, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "settings.updateIcons",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = (await adapter.getSiteSettings()) ?? {};

        const normalized = normalizeIconSettingsInput(input);

        const updatedSettings: SiteSettings = {
          ...currentSettings,
          icons: {
            enabledPacks: normalized.enabledPacks,
            defaultPack:
              normalized.defaultPack === "none"
                ? undefined
                : normalized.defaultPack,
          },
          updated_at: Date.now(),
        };

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "icons",
          },
          context,
        );

        log("info", "Icon settings updated", {
          defaultPack: normalized.defaultPack,
        });

        return {
          success: true as const,
          data: updatedSettings.icons,
        };
      } catch (error) {
        if (typeof ActionError === "function" && error instanceof ActionError) {
          throw error;
        }
        log("error", "Failed to update icon settings", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_ICONS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to update icon settings",
          },
        };
      }
    },
  }),

  /**
   * Get shared component grouping for Studio Components view and Stage.
   *
   * Site-wide taxonomy in `SiteSettings.studio.componentGrouping`.
   * Read gated by `editPageContent` or `editCms`.
   */
  getComponentGrouping: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireOperation(context, "settings.getComponentGrouping");

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = (await adapter.getSiteSettings()) ?? {};

        const parsed = StudioComponentGroupingSchema.safeParse(
          currentSettings.studio?.componentGrouping,
        );

        return {
          success: true as const,
          data: parsed.success ? parsed.data : { groups: [], assignments: {} },
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to load component grouping", { error });
        return {
          success: false as const,
          error: {
            code: "GET_COMPONENT_GROUPING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load component grouping",
          },
        };
      }
    },
  }),

  /**
   * /** Persist shared component grouping for Studio
   * Components view. Site-wide taxonomy in `SiteSettings.
   */
  updateComponentGrouping: defineAction({
    accept: "json",
    input: z.object({
      componentGrouping: StudioComponentGroupingSchema,
    }),
    handler: async ({ componentGrouping }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "settings.updateComponentGrouping",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = (await adapter.getSiteSettings()) ?? {};

        const updatedSettings: SiteSettings = {
          ...currentSettings,
          studio: {
            ...currentSettings.studio,
            componentGrouping,
          },
          updated_at: Date.now(),
        };

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "studio.componentGrouping",
          },
          context,
        );

        return {
          success: true as const,
          data: componentGrouping,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to persist component grouping", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_COMPONENT_GROUPING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to persist component grouping",
          },
        };
      }
    },
  }),

  /**
   * Get shared media grouping for Studio Media view.
   *
   * Site-wide taxonomy in `SiteSettings.studio.mediaGrouping`.
   * Read gated by `editPageContent` or `editCms`.
   */
  getMediaGrouping: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireOperation(context, "settings.getMediaGrouping");

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = (await adapter.getSiteSettings()) ?? {};

        const parsed = StudioMediaGroupingSchema.safeParse(
          currentSettings.studio?.mediaGrouping,
        );

        return {
          success: true as const,
          data: parsed.success ? parsed.data : { groups: [], assignments: {} },
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to load media grouping", { error });
        return {
          success: false as const,
          error: {
            code: "GET_MEDIA_GROUPING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to load media grouping",
          },
        };
      }
    },
  }),

  /**
   * Persist shared media grouping for Studio Media view.
   *
   * Site-wide taxonomy in `SiteSettings.studio.mediaGrouping`.
   * Write gated by `editSiteSettings` (managers / administrators).
   */
  updateMediaGrouping: defineAction({
    accept: "json",
    input: z.object({
      mediaGrouping: StudioMediaGroupingSchema,
    }),
    handler: async ({ mediaGrouping }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "settings.updateMediaGrouping",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);
        const currentSettings = (await adapter.getSiteSettings()) ?? {};

        const updatedSettings: SiteSettings = {
          ...currentSettings,
          studio: {
            ...currentSettings.studio,
            mediaGrouping,
          },
          updated_at: Date.now(),
        };

        await persistSiteSettings(adapter, updatedSettings, authorship);
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "studio.mediaGrouping",
          },
          context,
        );

        return {
          success: true as const,
          data: mediaGrouping,
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to persist media grouping", { error });
        return {
          success: false as const,
          error: {
            code: "UPDATE_MEDIA_GROUPING_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to persist media grouping",
          },
        };
      }
    },
  }),

  /**
   * Reset settings to defaults
   *
   * Resets all settings to their default values.
   *
   * @param confirm - Must be true to proceed
   * @returns Reset confirmation
   */
  reset: defineAction({
    accept: "json",
    input: z.object({
      confirm: z.literal(true, {
        error: "Must confirm settings reset",
      }),
    }),
    handler: async (_, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "settings.reset",
        "save-site-settings",
      );

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        const defaultSettings: SiteSettings = {
          utilityEngine: "unocss",
          icons: {
            enabledPacks: {
              lucide: true,
              "coreui-brands": true,
            },
            defaultPack: "lucide",
          },
          darkMode: "media",
          updated_at: Date.now(),
        };

        await persistSiteSettings(adapter, defaultSettings, authorship);
        await refreshRenderStylesAfterSettingsMutation(
          adapter,
          "default",
          authorship,
        );
        await touchContentRevisionForAction(
          adapter,
          {
            mutationKind: "save-site-settings",
            mutationTarget: "default",
          },
          context,
        );

        log("info", "Settings reset to defaults");

        return {
          success: true,
          data: sanitizeSiteSettingsForResponse(defaultSettings),
        };
      } catch (error) {
        if (error instanceof ActionError) throw error;
        log("error", "Failed to reset settings", { error });
        return {
          success: false,
          error: {
            code: "RESET_SETTINGS_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Failed to reset settings",
          },
        };
      }
    },
  }),
};
