import type { ColorScheme } from "@/lib/schemas/appearance";
import { studioIcons } from "@/lib/icons";

export interface ColorSchemeOption {
  readonly label: string;
  readonly value: ColorScheme;
  readonly iconClass: string;
  /** Extra keywords for command palette search (includes multi-word phrases). */
  readonly searchKeywords: string;
}

export const COLOR_SCHEME_OPTIONS = [
  {
    label: "Light",
    value: "light",
    iconClass: studioIcons.sun,
    searchKeywords: "light dark mode color scheme appearance theme",
  },
  {
    label: "Dark",
    value: "dark",
    iconClass: studioIcons.moon,
    searchKeywords: "dark mode light color scheme appearance theme",
  },
  {
    label: "System",
    value: "system",
    iconClass: studioIcons.monitor,
    searchKeywords: "system auto color mode scheme appearance theme",
  },
] as const satisfies ReadonlyArray<ColorSchemeOption>;
