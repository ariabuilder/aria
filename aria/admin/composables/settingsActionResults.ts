import { z } from "zod";

import { parseActionPayload } from "@/lib/actions/actionResult";
import {
  ANALYTICS_PROVIDER_IDS,
  type SiteSettings,
} from "../../lib/storage/adapter";
import { AppearanceStorageSchema } from "../../lib/schemas/appearance";
import { ComponentGroupingStateSchema } from "../../lib/schemas/componentGrouping";
import { MediaGroupingStateSchema } from "../../lib/schemas/mediaGrouping";
import { DiscoverySettingsSchema } from "../../lib/crawl/schemas";
import { ContentLocalizationSettingsSchema } from "../../lib/localization/contentLocale";

const UtilityEngineSchema = z.enum(["unocss", "custom"]);

const RuntimeTargetSchema = z.enum(["node", "cloudflare"]);

const CompilerMetadataSchema = z
  .looseObject({
    aria: z.looseObject({ version: z.string() }),
    astro: z.looseObject({ version: z.string(), major: z.number() }),
    runtime: RuntimeTargetSchema,
    storageSchemaVersion: z.string(),
    capturedAt: z.string(),
  });

const ProjectSystemMetadataSchema = z
  .looseObject({
    projectCreatedAt: z.string(),
    createdWith: CompilerMetadataSchema,
  });

const AnalyticsProviderIdSchema = z.enum(ANALYTICS_PROVIDER_IDS);

const AnalyticsSettingsSchema = z
  .looseObject({
    version: z.literal(1),
    activeProviders: z.array(AnalyticsProviderIdSchema),
    providers: z.record(z.string(), z.record(z.string(), z.string())),
  });

const UnocssThemeSchema = z
  .looseObject({
    colors: z.record(z.string(), z.unknown()).optional(),
    fontFamily: z.record(z.string(), z.array(z.string())).optional(),
    fontSize: z.record(z.string(), z.string()).optional(),
    spacing: z.record(z.string(), z.string()).optional(),
    borderRadius: z.record(z.string(), z.string()).optional(),
  });

const UnocssConfigSchema = z
  .looseObject({
    theme: UnocssThemeSchema.optional(),
    shortcuts: z.record(z.string(), z.string()).optional(),
    rules: z
      .array(z.tuple([z.string(), z.record(z.string(), z.unknown())]))
      .optional(),
    safelist: z.array(z.string()).optional(),
    presets: z.array(z.string()).optional(),
    blocklist: z.array(z.string()).optional(),
  });

const AppearanceSiteSettingsSchema = AppearanceStorageSchema;

const StudioComponentGroupingSchema = ComponentGroupingStateSchema;
const StudioMediaGroupingSchema = MediaGroupingStateSchema;

const IconSettingsSchema = z
  .looseObject({
    enabledPacks: z
      .object({
        lucide: z.boolean().optional(),
        "coreui-brands": z.boolean().optional(),
      })
      .optional(),
    defaultPack: z.enum(["lucide", "coreui-brands"]).optional(),
  });

const SiteSettingsPayloadSchema = z
  .looseObject({
    siteName: z.string().optional(),
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
    framework: UtilityEngineSchema.optional(),
    unocssConfig: UnocssConfigSchema.optional(),
    customFrameworkURL: z.string().optional(),
    darkMode: z.enum(["media", "class", "disabled"]).optional(),
    appearance: AppearanceSiteSettingsSchema.optional(),
    studio: z
      .looseObject({
        componentGrouping: StudioComponentGroupingSchema.optional(),
        mediaGrouping: StudioMediaGroupingSchema.optional(),
      }).optional(),
    icons: IconSettingsSchema.optional(),
    localization: z
      .looseObject({ content: ContentLocalizationSettingsSchema })
      .optional(),
    discovery: DiscoverySettingsSchema.optional(),
    agent: z.record(z.string(), z.unknown()).optional(),
    system: ProjectSystemMetadataSchema.optional(),
    updated_at: z.number().optional(),
  });

const SettingsActionSuccessSchema = z.object({
  success: z.literal(true),
  data: SiteSettingsPayloadSchema,
});

const SettingsActionFailureSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const SettingsActionResultSchema = z.union([
  SettingsActionSuccessSchema,
  SettingsActionFailureSchema,
]);

export function parseSiteSettingsPayload(payload: unknown): SiteSettings {
  const parsed = parseActionPayload(payload, SiteSettingsPayloadSchema);

  if (!parsed) {
    throw new Error("Invalid settings payload");
  }

  return parsed as SiteSettings;
}

export function unwrapSettingsActionResult(result: unknown): SiteSettings {
  const parsed = parseActionPayload(result, SettingsActionResultSchema, {
    invalidLogMessage: "Invalid settings action response",
  });

  if (!parsed) {
    throw new Error("Invalid response structure from settings action");
  }

  if (!parsed.success) {
    throw new Error(parsed.error.message || "Settings action failed");
  }

  return parsed.data as SiteSettings;
}

/** Accepts either `{ success, data }` or a bare settings payload from actions. */
export function coerceSettingsActionData(result: unknown): SiteSettings {
  const wrapped = parseActionPayload(result, SettingsActionResultSchema);
  if (wrapped) {
    if (!wrapped.success) {
      throw new Error(wrapped.error.message || "Settings action failed");
    }
    return wrapped.data as SiteSettings;
  }

  return parseSiteSettingsPayload(result);
}
