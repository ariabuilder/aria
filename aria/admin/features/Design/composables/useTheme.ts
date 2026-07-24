/**
 * Simple theme toggle wrapper around useAppearance. Quick toggle flips
 * color mode only, preserving the active theme palette.
 */

import { useAppearance } from "./useAppearance";

export function useTheme() {
  const { isDark, updateAppearance } = useAppearance();

  const toggleTheme = () => {
    const next = isDark.value ? "light" : "dark";
    void updateAppearance({ colorScheme: next }, { animate: true });
  };

  return { isDark, toggleTheme };
}
