import { z } from "zod";
import type { StudioMessageKey } from "@/i18n";

export const SettingsTabSchema = z.enum([
  "general",
  "localization",
  "appearance",
  "seo",
  "discovery",
  "analytics",
  "agent",
  "mcp",
  "api",
  "integrations",
  "custom-code",
  "users",
  "security",
  "email",
  "redirects",
  "import-export",
  "system",
]);

export type SettingsTab = z.infer<typeof SettingsTabSchema>;

export interface SettingsTabItem {
  id: SettingsTab;
  labelKey: StudioMessageKey;
}

export interface SettingsTabGroup {
  id: string;
  labelKey: StudioMessageKey;
  tabs: SettingsTabItem[];
}

export const settingsTabGroups: SettingsTabGroup[] = [
  {
    id: "site",
    labelKey: "settings.group.site",
    tabs: [
      { id: "general", labelKey: "settings.tab.general" },
      { id: "appearance", labelKey: "settings.tab.appearance" },
      { id: "localization", labelKey: "settings.tab.localization" },
      { id: "custom-code", labelKey: "settings.tab.customCode" },
    ],
  },
  {
    id: "growth",
    labelKey: "settings.group.growth",
    tabs: [
      { id: "seo", labelKey: "settings.tab.seo" },
      { id: "discovery", labelKey: "settings.tab.discovery" },
      { id: "analytics", labelKey: "settings.tab.analytics" },
      { id: "redirects", labelKey: "settings.tab.redirects" },
    ],
  },
  {
    id: "automation",
    labelKey: "settings.group.automation",
    tabs: [
      { id: "agent", labelKey: "settings.tab.agent" },
      { id: "mcp", labelKey: "settings.tab.mcp" },
      { id: "integrations", labelKey: "settings.tab.integrations" },
      { id: "email", labelKey: "settings.tab.email" },
    ],
  },
  {
    id: "admin",
    labelKey: "settings.group.admin",
    tabs: [
      { id: "users", labelKey: "settings.tab.users" },
      { id: "security", labelKey: "settings.tab.security" },
      { id: "import-export", labelKey: "settings.tab.importExport" },
      { id: "system", labelKey: "settings.tab.system" },
    ],
  },
];

export const settingsTabs: SettingsTabItem[] = settingsTabGroups.flatMap(
  (group) => group.tabs,
);
