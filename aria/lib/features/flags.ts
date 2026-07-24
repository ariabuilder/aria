import { FeatureFlagRegistrySchema, type FeatureFlagRegistry } from "./schemas";

export const FEATURE_FLAG_DEFINITIONS = {
  "studio.layouts": {
    defaultEnabled: false,
    description:
      "Studio layouts list/detail views and Composer layout template editing.",
    envKey: "PUBLIC_ARIA_FF_STUDIO_LAYOUTS",
  },
  "studio.agent": {
    defaultEnabled: true,
    description:
      "Aria Composer agent shell, settings, and customer-owned inference.",
    envKey: "PUBLIC_ARIA_FF_STUDIO_AGENT",
  },
} as const satisfies FeatureFlagRegistry;

FeatureFlagRegistrySchema.parse(FEATURE_FLAG_DEFINITIONS);
