/**
 * Theme palette, color mode, typography, and UI scale. Persists per-user via auth.
 */

import { ref, watch, computed, readonly, type DeepReadonly } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import {
  AppearanceSettingsSchema,
  DEFAULT_APPEARANCE_SETTINGS,
  getFoucAppearanceStorageKey,
  resolveAppearance,
  toAppearanceWritePayload,
  type AppearanceSettings,
  type ColorScheme,
  type FontFamily,
  type ThemeId,
} from "@/lib/schemas/appearance";
import { THEME_REGISTRY } from "../themes/registry";
import { applyPreloaderThemeColors } from "@/lib/preloader/theme";
import { useBuilderData } from "../../../composables/useBuilderData";
import { useUser } from "../../Auth/composables/useUser";
import {
  applyAppearanceWithTransition,
  isThemeTransitionInFlight,
  waitForThemeTransitionIdle,
} from "./applyAppearanceWithTransition";

export type {
  AppearanceSettings,
  ColorScheme,
  FontFamily,
  ThemeId,
} from "@/lib/schemas/appearance";

const FONT_FAMILY_MAP: DeepReadonly<Record<FontFamily, string>> = {
  Outfit:
    '"Outfit", "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  Inter:
    '"Inter", "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  System: "system-ui, -apple-system, sans-serif",
  Monospace:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as const;

const UI_ZOOM_TRANSITION_MS = 320;

const settings = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE_SETTINGS });
const lastPersistedSettings = ref<AppearanceSettings>({
  ...DEFAULT_APPEARANCE_SETTINGS,
});
const isLoading = ref(false);

let isInitialized = false;
let isUiZoomWatchRegistered = false;
let isLoadingComplete = false;
let darkModeMediaQuery: MediaQueryList | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let uiZoomTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSaveUserId: string | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function endUiZoomTransition(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("is-ui-zooming");
  if (uiZoomTransitionTimer) {
    clearTimeout(uiZoomTransitionTimer);
    uiZoomTransitionTimer = null;
  }
}

function beginUiZoomTransition(): void {
  if (typeof document === "undefined" || prefersReducedMotion()) return;

  const html = document.documentElement;
  endUiZoomTransition();
  html.classList.add("is-ui-zooming");

  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== html || event.propertyName !== "--ui-zoom") return;
    html.removeEventListener("transitionend", onTransitionEnd);
    endUiZoomTransition();
  };

  html.addEventListener("transitionend", onTransitionEnd);
  uiZoomTransitionTimer = setTimeout(() => {
    html.removeEventListener("transitionend", onTransitionEnd);
    endUiZoomTransition();
  }, UI_ZOOM_TRANSITION_MS);
}

function isSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveIsDark(colorScheme: ColorScheme): boolean {
  if (colorScheme === "dark") return true;
  if (colorScheme === "light") return false;
  return isSystemDark();
}

function applyTheme(
  themeId: ThemeId,
  colorScheme: ColorScheme,
  config?: AppearanceSettings,
): void {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const isDark = resolveIsDark(colorScheme);

  for (const theme of Object.values(THEME_REGISTRY)) {
    if (theme.cssClass) html.classList.remove(theme.cssClass);
  }
  html.removeAttribute("data-theme");

  html.classList.toggle("dark", isDark);

  const theme = THEME_REGISTRY[themeId];
  if (theme.cssClass) html.classList.add(theme.cssClass);
  if (theme.dataTheme) html.setAttribute("data-theme", theme.dataTheme);

  html.dataset.ariaInitialTheme = themeId;
  html.dataset.ariaInitialDark = isDark ? "1" : "0";

  applyPreloaderThemeColors(html, themeId, isDark);

  if (config) {
    const { user } = useUser();
    if (user.value?.id) {
      writeFoucMirror(user.value.id, config);
    }
  }
}

function applyFontAndZoom(config: AppearanceSettings): void {
  if (typeof window === "undefined") return;

  const fontStack = FONT_FAMILY_MAP[config.fontFamily];
  document.documentElement.style.removeProperty("--primary");
  document.documentElement.style.removeProperty("--color-primary");
  document.documentElement.style.setProperty("--font-family-ui", fontStack);
  document.documentElement.style.setProperty("--font-sans", fontStack);
  document.documentElement.style.setProperty("font-family", fontStack);
  document.documentElement.style.setProperty(
    "--ui-zoom",
    String(config.uiZoom),
  );
}

function applyAllSettings(config: AppearanceSettings): void {
  applyTheme(config.themeId, config.colorScheme, config);
  applyFontAndZoom(config);
}

function writeFoucMirror(userId: string, config: AppearanceSettings): void {
  if (typeof window === "undefined") return;

  try {
    const payload = AppearanceSettingsSchema.parse(config);
    window.localStorage.setItem(
      getFoucAppearanceStorageKey(userId),
      JSON.stringify(payload),
    );
  } catch {
    // Best-effort mirror only.
  }
}

function patchUserPreferences(
  userId: string,
  config: AppearanceSettings,
): void {
  const { user } = useUser();
  if (!user.value || user.value.id !== userId) return;

  user.value = {
    ...user.value,
    preferences: {
      ...(user.value.preferences ?? {}),
      appearance: AppearanceSettingsSchema.parse(config),
    },
  };
}

function shouldAnimateAppearanceChange(
  previous: AppearanceSettings,
  next: AppearanceSettings,
): boolean {
  return (
    previous.themeId !== next.themeId ||
    previous.colorScheme !== next.colorScheme
  );
}

function scheduleSave(userId: string): void {
  if (!isLoadingComplete) return;

  pendingSaveUserId = userId;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    void flushSave();
  }, 500);
}

async function flushSave(): Promise<void> {
  const userId = pendingSaveUserId;
  if (!userId || !isLoadingComplete) return;

  const config = settings.value;
  const payload = toAppearanceWritePayload(config);

  try {
    const { data, error } = await actions.auth.updatePreferences({
      appearance: payload,
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      throw new Error("Failed to save appearance preferences");
    }

    const persisted = data.preferences?.appearance
      ? AppearanceSettingsSchema.parse(data.preferences.appearance)
      : config;

    lastPersistedSettings.value = persisted;
    patchUserPreferences(userId, persisted);
    writeFoucMirror(userId, persisted);
  } catch (error) {
    console.error("[useAppearance] Failed to save settings:", error);
    settings.value = { ...lastPersistedSettings.value };
    applyAllSettings(lastPersistedSettings.value);
    toast.error("Could not save appearance settings");
  }
}

function setupSystemThemeListener(callback: () => void): void {
  if (typeof window === "undefined") return;

  darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  darkModeMediaQuery.addEventListener("change", callback);
}

function getLegacySiteAppearance(
  siteSettings: Record<string, unknown> | null,
): unknown {
  if (!siteSettings || typeof siteSettings !== "object") {
    return undefined;
  }

  if (!("appearance" in siteSettings)) {
    return undefined;
  }

  return siteSettings.appearance;
}

export function useAppearance() {
  const isDark = computed(() =>
    resolveIsDark(settings.value.colorScheme),
  );

  async function loadSettings(): Promise<void> {
    isLoading.value = true;

    try {
      const builderData = useBuilderData();
      const { user, fetchUser } = useUser();

      try {
        await builderData.fetchBuilderData();
      } catch {
        // init failed — fall through to auth/getMe fallback
      }

      if (!user.value) {
        try {
          await fetchUser();
        } catch {
          // unauthenticated contexts skip preference load
        }
      }

      const initPreferences = builderData.userPreferences?.value ?? null;
      const userAppearance =
        initPreferences?.appearance ??
        user.value?.preferences?.appearance ??
        undefined;

      const legacySiteAppearance = getLegacySiteAppearance(
        builderData.siteSettings.value,
      );

      const resolvedAppearance = resolveAppearance({
        userAppearance,
        legacySiteAppearance,
      });

      settings.value = resolvedAppearance;
      lastPersistedSettings.value = resolvedAppearance;

      if (user.value?.id) {
        writeFoucMirror(user.value.id, resolvedAppearance);
      }

      applyAllSettings(resolvedAppearance);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      console.error("[useAppearance] Failed to load settings:", error);
      settings.value = { ...DEFAULT_APPEARANCE_SETTINGS };
      lastPersistedSettings.value = { ...DEFAULT_APPEARANCE_SETTINGS };
    } finally {
      isLoading.value = false;
      isLoadingComplete = true;
    }
  }

  async function updateAppearance(
    patch: Partial<AppearanceSettings>,
    options?: { animate?: boolean },
  ): Promise<void> {
    if (!isLoadingComplete) return;

    const previous = settings.value;
    const merged = AppearanceSettingsSchema.parse({
      ...previous,
      ...patch,
    });

    const animate =
      (options?.animate ?? true) &&
      shouldAnimateAppearanceChange(previous, merged);

    const commit = () => {
      settings.value = merged;
      applyTheme(merged.themeId, merged.colorScheme, merged);
      applyFontAndZoom(merged);
    };

    if (animate) {
      await applyAppearanceWithTransition(commit, { animate: true });
    } else {
      commit();
    }

    const { user } = useUser();
    if (user.value?.id) {
      scheduleSave(user.value.id);
    }
  }

  function updateSetting<K extends keyof AppearanceSettings>(
    key: K,
    value: AppearanceSettings[K],
  ): void {
    const animate = key === "themeId" || key === "colorScheme";
    const patch: Partial<AppearanceSettings> = { [key]: value };
    void updateAppearance(patch, { animate });
  }

  if (!isInitialized && typeof window !== "undefined") {
    isInitialized = true;

    if (!isUiZoomWatchRegistered) {
      isUiZoomWatchRegistered = true;
      watch(
        () => settings.value.uiZoom,
        (newZoom, oldZoom) => {
          if (!isLoadingComplete) return;
          if (oldZoom === undefined || newZoom === oldZoom) return;
          beginUiZoomTransition();
        },
        { flush: "sync" },
      );
    }

    loadSettings();

    setupSystemThemeListener(() => {
      if (settings.value.colorScheme !== "system") return;

      void waitForThemeTransitionIdle().then(() => {
        if (isThemeTransitionInFlight()) return;
        applyTheme(
          settings.value.themeId,
          settings.value.colorScheme,
          settings.value,
        );
      });
    });
  }

  return {
    settings: readonly(settings),
    isDark,
    isLoading: readonly(isLoading),
    updateAppearance,
    updateSetting,
    loadSettings,
    reapply: () => applyAllSettings(settings.value),
    reset: () => {
      void updateAppearance(
        { ...DEFAULT_APPEARANCE_SETTINGS },
        { animate: false },
      );
    },
  };
}
