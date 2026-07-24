/**
 * Shared UnoCSS runtime defaults for the stage iframe and design tokens.
 */

/** Container shortcut without responsive padding (iframe JIT cannot expand sm:/lg: in shortcuts reliably). */
export const RUNTIME_SAFE_CONTAINER_SHORTCUT =
  "w-full mx-auto px-4 max-w-7xl";

/** Variant utilities referenced by preset-wind's built-in `container` shortcut. */
export const PRESET_WIND_CONTAINER_VARIANT_UTILITIES = [
  "sm:px-6",
  "lg:px-8",
] as const;

const VARIANT_UTILITY_RE = /^(?:sm|md|lg|xl|2xl):/;

/**
 * Collect responsive variant utilities (sm:, md:, lg:, etc.) from shortcut expansion strings.
 */
export function collectVariantUtilitiesFromShortcuts(
  shortcuts: Record<string, string>,
): string[] {
  const utilities = new Set<string>();

  for (const value of Object.values(shortcuts)) {
    for (const token of value.split(/\s+/)) {
      if (VARIANT_UTILITY_RE.test(token)) {
        utilities.add(token);
      }
    }
  }

  return [...utilities];
}

/**
 * Safelist entries for iframe/runtime Uno: all variant utilities used in design shortcuts,
 * plus preset-wind container deps when the preset shortcut still registers.
 */
export function buildRuntimeShortcutSafelist(
  shortcuts: Record<string, string>,
): string[] {
  return [
    ...collectVariantUtilitiesFromShortcuts(shortcuts),
    ...PRESET_WIND_CONTAINER_VARIANT_UTILITIES,
  ];
}
