import { z } from "zod";

import type { IconPackKey } from "./packs";

const EnabledPackMapSchema = z.object({
  lucide: z.boolean().optional(),
  "coreui-brands": z.boolean().optional(),
});

const IconSiteSettingsSchema = z.object({
  icons: z
    .object({
      enabledPacks: EnabledPackMapSchema.optional(),
    })
    .optional(),
});

const DEFAULT_ENABLED_PACK_MAP = {
  lucide: true,
  "coreui-brands": true,
} satisfies Record<IconPackKey, boolean>;

export function getDefaultEnabledPackMap(): Record<IconPackKey, boolean> {
  return { ...DEFAULT_ENABLED_PACK_MAP };
}

export function getEnabledPackMap(
  settings: unknown,
): Record<IconPackKey, boolean> {
  const parsed = IconSiteSettingsSchema.safeParse(settings);

  if (!parsed.success) {
    return getDefaultEnabledPackMap();
  }

  const enabled = parsed.data.icons?.enabledPacks;

  return {
    lucide: enabled?.lucide ?? DEFAULT_ENABLED_PACK_MAP.lucide,
    "coreui-brands":
      enabled?.["coreui-brands"] ?? DEFAULT_ENABLED_PACK_MAP["coreui-brands"],
  };
}
