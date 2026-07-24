/**
 * Map of section/component types to their corresponding HugeIcons classes.
 */
const SECTION_ICON_MAP: Record<string, string> = {
  // Layout / Structure
  section: "i-hugeicons:align-box-middle-center",
  container: "i-hugeicons:bounding-box",
  div: "i-hugeicons:square",

  // Marketing sections
  hero: "i-hugeicons:stars",
  header: "i-hugeicons:header-01",
  footer: "i-hugeicons:footer-01",
  features: "i-hugeicons:grid-view",
  testimonials: "i-hugeicons:quotes",
  pricing: "i-hugeicons:tag-01",
  faq: "i-hugeicons:help-circle",
  cta: "i-hugeicons:cursor-01",
  contact: "i-hugeicons:mail-01",
  blog: "i-hugeicons:article",
  gallery: "i-hugeicons:image-01",
  logos: "i-hugeicons:grid",
  stats: "i-hugeicons:chart-01",
  team: "i-hugeicons:user-group",
  navigation: "i-hugeicons:menu-01",

  // Media
  image: "i-hugeicons:image-01",
  video: "i-hugeicons:video-01",
  icon: "i-hugeicons:star",

  // Components
  component: "i-hugeicons:keyframe",
  form: "i-hugeicons:input-field",
  button: "i-hugeicons:button-01",
  text: "i-hugeicons:text",
  heading: "i-hugeicons:heading-01",
  card: "i-hugeicons:layout-01",
  list: "i-hugeicons:menu-02",
  tabs: "i-hugeicons:tab",
  accordion: "i-hugeicons:accordion",
  modal: "i-hugeicons:modal",
  slider: "i-hugeicons:slider-01",
  countdown: "i-hugeicons:clock-01",
  map: "i-hugeicons:map-01",
  divider: "i-hugeicons:separator",
  spacer: "i-hugeicons:space-width",
  code: "i-hugeicons:source-code",
  embed: "i-hugeicons:code",
  custom: "i-hugeicons:component",
};

/**
 * Default icon for unknown/unmapped types
 */
const DEFAULT_SECTION_ICON = "i-hugeicons:square";

/**
 * Get the icon class for a given section/component type.
 *
 * @param type - The section or component type string (case-insensitive)
 * @returns The HugeIcons icon class string
 *
 * @example
 * ```ts
 * getSectionIcon("hero") // returns "i-hugeicons:stars"
 * getSectionIcon("UNKNOWN") // returns "i-hugeicons:square" (default)
 * ```
 */
export function getSectionIcon(type: string): string {
  const normalized = type.toLowerCase().trim();
  return SECTION_ICON_MAP[normalized] ?? DEFAULT_SECTION_ICON;
}

export { SECTION_ICON_MAP };
