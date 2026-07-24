import type { AppearanceSettings, ColorScheme, ThemeId } from "@/lib/schemas/appearance";
import { COLOR_SCHEME_OPTIONS } from "@/features/Design/themes/colorSchemeOptions";
import { THEME_OPTIONS } from "@/features/Design/themes/registry";
import type { CommandPaletteItem } from "./commandPalette";
import type { StudioI18n } from "@/i18n";

const APPEARANCE_CATEGORY = "Appearance";
const THEME_ICON = "i-hugeicons:colors";
const SETTINGS_ICON = "i-hugeicons:colors";

export interface BuildAppearancePaletteItemsOptions {
  current: Pick<AppearanceSettings, "themeId" | "colorScheme">;
  isReady: boolean;
  onSetTheme: (themeId: ThemeId) => void;
  onSetColorScheme: (scheme: ColorScheme) => void;
  onOpenSettings: () => void;
  onClose: () => void;
  t?: StudioI18n["t"];
}

function runWhenReady(
  isReady: boolean,
  onClose: () => void,
  handler: () => void,
): () => void {
  return () => {
    if (!isReady) {
      return;
    }
    onClose();
    handler();
  };
}

export function buildAppearancePaletteItems(
  options: BuildAppearancePaletteItemsOptions,
): CommandPaletteItem[] {
  const t = options.t;
  const text = (key: Parameters<NonNullable<typeof t>>[0], fallback: string, values?: Record<string, string>) =>
    t ? t(key, values) : fallback;
  const items: CommandPaletteItem[] = [
    {
      id: "appearance-settings",
      label: text("commandSearch.appearance.openSettings", "Open appearance settings"),
      description: options.isReady ? undefined : text("commandSearch.loading", "Loading..."),
      category: text("commandSearch.category.appearance", APPEARANCE_CATEGORY),
      icon: SETTINGS_ICON,
      keywords:
        "appearance theme settings palette color mode preferences",
      action: runWhenReady(options.isReady, options.onClose, options.onOpenSettings),
    },
  ];

  for (const theme of THEME_OPTIONS) {
    const isCurrent = options.current.themeId === theme.id;
    items.push({
      id: `appearance-theme-${theme.id}`,
      label: text("commandSearch.appearance.useTheme", `Use ${theme.label} theme`, { theme: theme.label }),
      description: isCurrent ? text("commandSearch.appearance.current", "Current") : options.isReady ? undefined : text("commandSearch.loading", "Loading..."),
      category: text("commandSearch.category.appearance", APPEARANCE_CATEGORY),
      icon: THEME_ICON,
      keywords: `${theme.label} theme appearance palette ${theme.id} primary set`,
      action: runWhenReady(options.isReady, options.onClose, () => {
        if (options.current.themeId === theme.id) {
          return;
        }
        options.onSetTheme(theme.id);
      }),
    });
  }

  for (const mode of COLOR_SCHEME_OPTIONS) {
    const isCurrent = options.current.colorScheme === mode.value;
    const localizedMode = text(
      `commandSearch.appearance.${mode.value}`,
      mode.label,
    );
    const modeLabel = text(
      mode.value === "system"
        ? "commandSearch.appearance.systemMode"
        : "commandSearch.appearance.colorMode",
      mode.value === "system" ? "System color mode" : `${mode.label} mode`,
      mode.value === "system" ? undefined : { mode: localizedMode },
    );
    items.push({
      id: `appearance-scheme-${mode.value}`,
      label: modeLabel,
      description: isCurrent ? text("commandSearch.appearance.current", "Current") : options.isReady ? undefined : text("commandSearch.loading", "Loading..."),
      category: text("commandSearch.category.appearance", APPEARANCE_CATEGORY),
      icon: mode.iconClass,
      keywords: mode.searchKeywords,
      action: runWhenReady(options.isReady, options.onClose, () => {
        if (options.current.colorScheme === mode.value) {
          return;
        }
        options.onSetColorScheme(mode.value);
      }),
    });
  }

  return items;
}
