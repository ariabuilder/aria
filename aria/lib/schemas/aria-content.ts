import { z } from "zod";
import { ANALYTICS_PROVIDER_IDS } from "../storage/adapter";
import { PageSchema, StylesSchema } from "./storage";
import { JsonObjectSchema, JsonValueSchema } from "./json";
import { isValidTimeZone } from "../datetime/timeZone";

export const ariaPageSchema = PageSchema;

export const ariaLayoutSchema = z.object({
  slug: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  blocks: z.array(JsonValueSchema).optional(),
  frontmatter: JsonObjectSchema.optional(),
  regions: JsonObjectSchema.optional(),
  draft: z.boolean().optional(),
  updated_at: z.number().optional(),
});

export const ariaComponentSchema = z.object({
  slug: z.string(),
  title: z.string().optional(),
  type: z.string().optional(),
  blocks: z.array(JsonValueSchema).optional(),
  draft: z.boolean().optional(),
  updated_at: z.number().optional(),
});

export const ariaStyleSchema = StylesSchema;

const analyticsProviderIdSchema = z.enum(ANALYTICS_PROVIDER_IDS);

const analyticsProviderFieldsSchema = z.record(z.string(), z.string());

const analyticsProviderShape = Object.fromEntries(
  ANALYTICS_PROVIDER_IDS.map((providerId) => [
    providerId,
    analyticsProviderFieldsSchema.optional(),
  ]),
) as Record<
  (typeof ANALYTICS_PROVIDER_IDS)[number],
  z.ZodOptional<typeof analyticsProviderFieldsSchema>
>;

const analyticsProvidersSchema = z.object(analyticsProviderShape).strict();

const analyticsSettingsSchema = z.object({
  version: z.literal(1),
  activeProviders: z.array(analyticsProviderIdSchema),
  providers: analyticsProvidersSchema,
});

export const ariaSettingsSchema = z.object({
  siteName: z.string().optional(),
  timeZone: z.string().refine(isValidTimeZone).optional(),
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
  analytics: analyticsSettingsSchema.optional(),
  customHeadCode: z.string().optional(),
  customBodyCode: z.string().optional(),
  customFooterCode: z.string().optional(),
  updated_at: z.number().optional(),
});
