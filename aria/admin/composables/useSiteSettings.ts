import { ref, computed, readonly, type Ref } from "vue";
import { actions } from "astro:actions";
import type {
  SiteSettings,
  AnalyticsProviderId,
  AnalyticsSettings,
} from "../../lib/storage/adapter";
import {
  getSiteSettingsUtilityEngine,
  normalizeSiteSettings,
} from "../../lib/storage/adapter";
import {
  ANALYTICS_PROVIDERS,
  ANALYTICS_PROVIDER_IDS,
} from "../../lib/analytics/providers";
import { log } from "@/lib/utils/logger";
import {
  parseSiteSettingsPayload,
  unwrapSettingsActionResult,
} from "./settingsActionResults";
import {
  DiscoverySettingsSchema,
  mergeDiscoverySettings,
  type DiscoverySettings,
} from "../../lib/crawl/schemas";
import {
  DEFAULT_CONTENT_LOCALIZATION,
  ContentLocalizationSettingsSchema,
  type ContentLocalizationSettings,
} from "../../lib/localization/contentLocale";
import { DEFAULT_SITE_TIME_ZONE } from "../../lib/datetime/timeZone";

const STORAGE_KEY = "aria-site-settings" as const;

export { STORAGE_KEY as SITE_SETTINGS_STORAGE_KEY };

export const ICON_PACK_CATALOG = [
  {
    id: "lucide",
    label: "Lucide",
    group: "icon",
    description:
      "Consistent, stroke-based icons built for precision and scalability.",
    iconCount: "1,500+",
    website: "https://lucide.dev",
    previewIcon: "i-lucide:feather",
  },
  {
    id: "coreui-brands",
    label: "CoreUI Brands",
    group: "brand",
    description:
      "Popular brand and company logos for social links and integrations.",
    iconCount: "800+",
    website: "https://coreui.io/icons",
    previewIcon: "i-coreui-brands:github",
  },
] as const;

export type IconPackKey = (typeof ICON_PACK_CATALOG)[number]["id"];

export type IconEnabledPacks = Record<IconPackKey, boolean>;

export interface IconSettings {
  enabledPacks: IconEnabledPacks;
  defaultPack?: IconPackKey;
}

const DEFAULT_ICON_SETTINGS: IconSettings = {
  enabledPacks: {
    lucide: true,
    "coreui-brands": true,
  },
  defaultPack: "lucide",
};

function isIconPackKey(value: string): value is IconPackKey {
  return ICON_PACK_CATALOG.some((pack) => pack.id === value);
}

function normalizeIconSettings(raw: SiteSettings["icons"]): IconSettings {
  const incoming = raw?.enabledPacks ?? {};

  const enabledPacks: IconEnabledPacks = {
    lucide: incoming.lucide ?? DEFAULT_ICON_SETTINGS.enabledPacks.lucide,
    "coreui-brands":
      incoming["coreui-brands"] ??
      DEFAULT_ICON_SETTINGS.enabledPacks["coreui-brands"],
  };

  const defaultPack = raw?.defaultPack ?? DEFAULT_ICON_SETTINGS.defaultPack;

  const resolvedDefaultPack: IconPackKey | undefined =
    defaultPack && isIconPackKey(defaultPack) && enabledPacks[defaultPack]
      ? defaultPack
      : undefined;

  return { enabledPacks, defaultPack: resolvedDefaultPack };
}

function normalizeSettingsShape(
  input: SiteSettings | null | undefined,
): SiteSettings {
  const {
    breakpoints: _breakpoints,
    viewports: _viewports,
    viewportBreakpointMap: _viewportBreakpointMap,
    utilityLibraries: _utilityLibraries,
    ...parsed
  } = (normalizeSiteSettings({ ...(input ?? {}) }) ?? {}) as SiteSettings & {
    breakpoints?: unknown;
    viewports?: unknown;
    viewportBreakpointMap?: unknown;
    utilityLibraries?: unknown;
  };

  parsed.icons = normalizeIconSettings(parsed.icons);

  const normalizedProviders: Partial<
    Record<AnalyticsProviderId, Record<string, string>>
  > = {};

  const analyticsInput = parsed.analytics;
  if (analyticsInput?.providers) {
    for (const providerId of ANALYTICS_PROVIDER_IDS) {
      const providerFields = analyticsInput.providers[providerId];
      if (!providerFields) continue;

      normalizedProviders[providerId] = Object.fromEntries(
        Object.entries(providerFields).map(([key, value]) => [
          key,
          typeof value === "string" ? value : String(value ?? ""),
        ]),
      );
    }
  }

  const activeProviders = Array.from(
    new Set(
      (analyticsInput?.activeProviders ?? []).filter((providerId) =>
        ANALYTICS_PROVIDER_IDS.includes(providerId),
      ),
    ),
  ) as AnalyticsProviderId[];

  parsed.analytics = {
    version: 1,
    activeProviders,
    providers: normalizedProviders,
    ...(analyticsInput?.studioDisplay
      ? { studioDisplay: analyticsInput.studioDisplay }
      : {}),
  };

  return parsed;
}

interface SiteSettingsOptions {
  debug?: boolean;
  autoLoad?: boolean;
}

interface LoadSettingsOptions {
  /** Force a server reload even when settings are already hydrated */
  force?: boolean;
}

// SHARED STATE (Singleton Pattern)

/**
 * Attempts to hydrate settings from localStorage synchronously. This avoids an
 * async-fetch gap on repeat visits so the dashboard h1 (LCP.
 */
function hydrateSettingsFromCache(): SiteSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return normalizeSettingsShape(parseSiteSettingsPayload(parsed));
  } catch {
    // Corrupted or incompatible cache — clean up silently.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable (private browsing, quota exceeded).
    }
    return null;
  }
}

/** Reactive settings state shared across all composable instances */
const settings = ref<SiteSettings | null>(hydrateSettingsFromCache());

/**
 * Tracks whether current settings were hydrated from localStorage rather
 * than fetched from the server. When true, `loadSettings()` always.
 */
let _hydratedFromCache = settings.value !== null;

/** Loading state for async operations */
const isLoading = ref(false);

const isSaving = ref(false);

const error = ref<Error | null>(null);

/** Initialization flag to prevent duplicate loads */
let isInitialized = false;

let inFlightSettingsLoad: Promise<void> | null = null;
let queuedForcedSettingsLoad: Promise<void> | null = null;
/** Bumped on local writes so in-flight GETs cannot overwrite fresher state. */
let settingsLoadGeneration = 0;

/**
 * Centralized site settings management for Aria builder.
 *
 * Reactive access to:
 * - Utility-engine mode (UnoCSS or semantic-only CSS output)
 *
 * Settings are persisted to localStorage and shared globally via singleton pattern.
 *
 * @example
 * ```ts
 * const { utilityEngine, loadSettings } = useSiteSettings({ autoLoad: true });
 * ```
 */
export function useSiteSettings(options: SiteSettingsOptions = {}) {
  const { debug = false, autoLoad = false } = options;

  /**
   * Active utility engine backing class generation.
   */
  const utilityEngine = computed<UtilityEngine>(() => {
    return getSiteSettingsUtilityEngine(settings.value);
  });

  const framework = computed<UtilityEngine>(() => utilityEngine.value);

  const iconSettings = computed<IconSettings>(() => {
    return normalizeIconSettings(settings.value?.icons);
  });

  const enabledIconPacks = computed<IconPackKey[]>(() => {
    return (
      Object.keys(iconSettings.value.enabledPacks) as IconPackKey[]
    ).filter((pack) => iconSettings.value.enabledPacks[pack]);
  });

  const defaultIconPack = computed<IconPackKey | undefined>(() => {
    return iconSettings.value.defaultPack;
  });

  const analytics = computed<AnalyticsSettings>(() => {
    return (
      settings.value?.analytics ?? {
        version: 1,
        activeProviders: [],
        providers: {},
      }
    );
  });

  const generalSettings = computed(() => ({
    siteName: settings.value?.siteName ?? "",
    timeZone: settings.value?.timeZone ?? DEFAULT_SITE_TIME_ZONE,
    siteDescription: settings.value?.siteDescription ?? "",
    siteUrl: settings.value?.siteUrl ?? "",
    favicon: settings.value?.favicon ?? "",
  }));

  const seoDefaults = computed(() => ({
    seoTitle: settings.value?.seoTitle ?? "",
    seoDescription: settings.value?.seoDescription ?? "",
    seoKeywords: settings.value?.seoKeywords ?? "",
    ogImage: settings.value?.ogImage ?? "",
    twitterCard: settings.value?.twitterCard ?? "summary_large_image",
  }));

  const discoverySettings = computed<DiscoverySettings>(() =>
    DiscoverySettingsSchema.parse(settings.value?.discovery ?? {}),
  );

  const contentLocalization = computed<ContentLocalizationSettings>(() =>
    ContentLocalizationSettingsSchema.parse(
      settings.value?.localization?.content ?? DEFAULT_CONTENT_LOCALIZATION,
    ),
  );

  const customCode = computed(() => ({
    head: settings.value?.customHeadCode ?? "",
    body: settings.value?.customBodyCode ?? "",
    footer: settings.value?.customFooterCode ?? "",
  }));

  const activeAnalyticsProviders = computed<AnalyticsProviderId[]>(() => {
    return analytics.value.activeProviders;
  });

  /**
   * Settings initialized and loaded.
   */
  const isReady = computed(() => settings.value !== null && !isLoading.value);

  /**
   * Loads site settings from server actions (source of truth).
   * Falls back to local cache only when action calls fail.
   */
  async function loadSettings(
    loadOptions: LoadSettingsOptions = {},
  ): Promise<void> {
    // When settings were hydrated from localStorage (repeat visitor) we still
    // need to fetch from the server to stay fresh. Only skip when settings
    // were previously loaded from the server in this session.
    if (!loadOptions.force && settings.value !== null && !_hydratedFromCache) {
      if (debug) {
        log(
          "debug",
          "[useSiteSettings] Skipping load; settings already hydrated from server",
        );
      }
      return;
    }

    if (inFlightSettingsLoad) {
      if (debug) log("debug", "[useSiteSettings] Load already in progress");
      if (!loadOptions.force) {
        await inFlightSettingsLoad;
        return;
      }

      if (!queuedForcedSettingsLoad) {
        const activeLoad = inFlightSettingsLoad;
        queuedForcedSettingsLoad = activeLoad
          .catch(() => undefined)
          .then(() => startSettingsLoad())
          .finally(() => {
            queuedForcedSettingsLoad = null;
          });
      }

      await queuedForcedSettingsLoad;
      return;
    }

    await startSettingsLoad();
  }

  async function startSettingsLoad(): Promise<void> {
    const loadPromise = performSettingsLoad();
    inFlightSettingsLoad = loadPromise;

    return loadPromise.finally(() => {
      if (inFlightSettingsLoad === loadPromise) {
        inFlightSettingsLoad = null;
      }
    });
  }

  async function performSettingsLoad(): Promise<void> {
    const loadGeneration = ++settingsLoadGeneration;
    isLoading.value = true;
    error.value = null;

    try {
      const { data, error: actionError } = await actions.settings.get();
      if (actionError) {
        throw actionError;
      }

      if (loadGeneration !== settingsLoadGeneration) {
        return;
      }

      const serverSettings = unwrapSettingsActionResult(data);
      settings.value = normalizeSettingsShape(serverSettings);
      _hydratedFromCache = false;

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
      }

      if (debug) {
        log("debug", "[useSiteSettings] Loaded from server", {
          settings: settings.value,
        });
      }

      isInitialized = true;
    } catch (err) {
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem(STORAGE_KEY);
          if (cached) {
            const parsedCached: unknown = JSON.parse(cached);
            settings.value = normalizeSettingsShape(
              parseSiteSettingsPayload(parsedCached),
            );
            if (debug) {
              log("warn", "[useSiteSettings] Using local cache fallback");
            }
            return;
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          // Ignore cache parse fallback errors and throw original error below.
        }
      }

      error.value =
        err instanceof Error ? err : new Error("Failed to load site settings");
      log("error", "[useSiteSettings] Load failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw error.value;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Persists site settings through Astro actions.
   * Merges partial updates and keeps local cache synchronized.
   */
  async function saveSettings(updates: SiteSettingsUpdate): Promise<void> {
    isSaving.value = true;
    error.value = null;

    try {
      const { utilityEngine: utilityEngineUpdate, ...siteSettingsUpdates } =
        updates;

      const actionPayload: SiteSettingsUpdate = {
        ...siteSettingsUpdates,
        ...(utilityEngineUpdate ? { utilityEngine: utilityEngineUpdate } : {}),
      };

      const { data, error: actionError } =
        await actions.settings.update(actionPayload);
      if (actionError) {
        throw actionError;
      }

      const persisted = unwrapSettingsActionResult(data);
      settings.value = normalizeSettingsShape(persisted);

      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
      }

      if (debug) {
        log("debug", "[useSiteSettings] Saved", { updates: actionPayload });
      }
    } catch (err) {
      error.value =
        err instanceof Error ? err : new Error("Failed to save site settings");

      log("error", "[useSiteSettings] Save failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw error.value;
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * Resets settings to factory defaults.
   */
  async function resetSettings(): Promise<void> {
    await saveSettings({
      icons: {
        enabledPacks: { ...DEFAULT_ICON_SETTINGS.enabledPacks },
        defaultPack: DEFAULT_ICON_SETTINGS.defaultPack,
      },
    });

    if (debug) {
      log("debug", "[useSiteSettings] Reset to defaults");
    }
  }

  function isIconPackEnabled(pack: IconPackKey): boolean {
    return iconSettings.value.enabledPacks[pack] === true;
  }

  async function setDefaultIconPack(pack?: IconPackKey): Promise<void> {
    if (pack && !isIconPackEnabled(pack)) {
      throw new Error(`Cannot set default pack to disabled pack "${pack}"`);
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await actions.settings.updateIcons({
        enabledPacks: { ...iconSettings.value.enabledPacks },
        defaultPack: pack,
      });

      if (result.error) {
        throw result.error;
      }

      const merged: SiteSettings = normalizeSettingsShape({
        ...settings.value,
        icons: {
          enabledPacks: {
            ...iconSettings.value.enabledPacks,
          },
          ...(pack ? { defaultPack: pack } : {}),
        },
      });

      settings.value = merged;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function toggleIconPack(
    pack: IconPackKey,
    nextEnabled?: boolean,
  ): Promise<void> {
    const current = iconSettings.value;
    const desired =
      nextEnabled === undefined ? !current.enabledPacks[pack] : nextEnabled;

    if (desired === current.enabledPacks[pack]) {
      return;
    }

    const nextEnabledPacks: IconEnabledPacks = {
      ...current.enabledPacks,
      [pack]: desired,
    };

    const nextDefaultPack: IconPackKey | undefined =
      current.defaultPack && nextEnabledPacks[current.defaultPack]
        ? current.defaultPack
        : undefined;

    await updateIconSettings({
      enabledPacks: nextEnabledPacks,
      defaultPack: nextDefaultPack,
    });
  }

  async function updateIconSettings(
    next: Partial<IconSettings>,
  ): Promise<void> {
    const merged = {
      enabledPacks: {
        ...iconSettings.value.enabledPacks,
        ...(next.enabledPacks ?? {}),
      },
      defaultPack: next.defaultPack ?? iconSettings.value.defaultPack,
    };

    if (merged.defaultPack && !merged.enabledPacks[merged.defaultPack]) {
      throw new Error("Default icon pack must be enabled");
    }

    isLoading.value = true;
    error.value = null;

    try {
      const result = await actions.settings.updateIcons({
        enabledPacks: merged.enabledPacks,
        ...(merged.defaultPack ? { defaultPack: merged.defaultPack } : {}),
      });

      if (result.error) {
        throw result.error;
      }

      const mergedSettings: SiteSettings = normalizeSettingsShape({
        ...settings.value,
        icons: merged,
      });

      settings.value = mergedSettings;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedSettings));
      }
    } finally {
      isLoading.value = false;
    }
  }

  function isAnalyticsProviderActive(providerId: AnalyticsProviderId): boolean {
    return analytics.value.activeProviders.includes(providerId);
  }

  async function activateAnalyticsProvider(
    providerId: AnalyticsProviderId,
  ): Promise<void> {
    if (isAnalyticsProviderActive(providerId)) {
      return;
    }

    await saveSettings({
      analytics: {
        ...analytics.value,
        activeProviders: [...analytics.value.activeProviders, providerId],
        providers: {
          ...analytics.value.providers,
          [providerId]: analytics.value.providers[providerId] ?? {},
        },
      },
    });
  }

  async function deactivateAnalyticsProvider(
    providerId: AnalyticsProviderId,
  ): Promise<void> {
    if (!isAnalyticsProviderActive(providerId)) {
      return;
    }

    await saveSettings({
      analytics: {
        ...analytics.value,
        activeProviders: analytics.value.activeProviders.filter(
          (id) => id !== providerId,
        ),
      },
    });
  }

  async function removeAnalyticsProvider(
    providerId: AnalyticsProviderId,
  ): Promise<void> {
    const nextProviders = { ...analytics.value.providers };
    delete nextProviders[providerId];

    await saveSettings({
      analytics: {
        ...analytics.value,
        activeProviders: analytics.value.activeProviders.filter(
          (id) => id !== providerId,
        ),
        providers: nextProviders,
      },
    });
  }

  async function setStudioCloudflareTraffic(enabled: boolean): Promise<void> {
    await saveSettings({
      analytics: {
        ...analytics.value,
        studioDisplay: {
          ...analytics.value.studioDisplay,
          cloudflareTraffic: enabled,
        },
      },
    });
  }

  async function setAnalyticsProviderField(
    providerId: AnalyticsProviderId,
    key: string,
    value: string,
  ): Promise<void> {
    const current = analytics.value.providers[providerId] ?? {};

    await saveSettings({
      analytics: {
        ...analytics.value,
        providers: {
          ...analytics.value.providers,
          [providerId]: {
            ...current,
            [key]: value,
          },
        },
      },
    });
  }

  async function updateGeneralSettings(next: {
    siteName?: string;
    timeZone?: string;
    siteDescription?: string;
    siteUrl?: string;
    favicon?: string;
  }): Promise<void> {
    await saveSettings({
      siteName: next.siteName?.trim() || undefined,
      timeZone: next.timeZone?.trim() || undefined,
      siteDescription: next.siteDescription?.trim() || undefined,
      siteUrl: next.siteUrl?.trim() || undefined,
      favicon: next.favicon != null ? next.favicon.trim() : undefined,
    });
  }

  async function updateSeoDefaults(next: {
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string;
    ogImage?: string;
    twitterCard?: string;
  }): Promise<void> {
    await saveSettings({
      seoTitle: next.seoTitle?.trim() || undefined,
      seoDescription: next.seoDescription?.trim() || undefined,
      seoKeywords: next.seoKeywords?.trim() || undefined,
      ogImage: next.ogImage != null ? next.ogImage.trim() : undefined,
      twitterCard: next.twitterCard?.trim() || undefined,
    });
  }

  async function updateContentLocalization(
    next: ContentLocalizationSettings,
  ): Promise<void> {
    await saveSettings({
      localization: {
        content: ContentLocalizationSettingsSchema.parse(next),
      },
    });
  }

  function replaceDiscoverySettingsLocal(next: DiscoverySettings): void {
    settings.value = normalizeSettingsShape({
      ...(settings.value ?? {}),
      discovery: DiscoverySettingsSchema.parse(next),
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    }
  }

  function applySettingsActionResult(payload: Partial<SiteSettings>): void {
    settingsLoadGeneration += 1;
    settings.value = normalizeSettingsShape({
      ...(settings.value ?? {}),
      ...payload,
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
    }
  }

  async function updateDiscoverySettings(
    next: Partial<DiscoverySettings>,
  ): Promise<void> {
    isSaving.value = true;
    error.value = null;
    try {
      const { data, error: actionError } =
        await actions.settings.updateDiscovery(next);
      if (actionError) {
        throw actionError;
      }
      const payload = unwrapSettingsActionResult(data);
      const resolvedDiscovery = payload.discovery
        ? DiscoverySettingsSchema.parse(payload.discovery)
        : mergeDiscoverySettings(settings.value?.discovery, next);
      settings.value = normalizeSettingsShape({
        ...(settings.value ?? {}),
        ...payload,
        discovery: resolvedDiscovery,
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
      }
    } catch (err) {
      error.value =
        err instanceof Error
          ? err
          : new Error("Failed to save discovery settings");
      throw error.value;
    } finally {
      isSaving.value = false;
    }
  }

  async function setCustomHeadCode(code: string): Promise<void> {
    await saveSettings({
      customHeadCode: code.trim().length > 0 ? code : undefined,
    });
  }

  async function setCustomBodyCode(code: string): Promise<void> {
    await saveSettings({
      customBodyCode: code.trim().length > 0 ? code : undefined,
    });
  }

  async function setCustomFooterCode(code: string): Promise<void> {
    await saveSettings({
      customFooterCode: code.trim().length > 0 ? code : undefined,
    });
  }

  // Auto-load on initialization if configured
  if (autoLoad && !isInitialized && typeof window !== "undefined") {
    loadSettings().catch((err) => {
      log("error", "[useSiteSettings] Auto-load failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return {
    // State (readonly to prevent external mutations)
    settings: readonly(settings) as Ref<SiteSettings | null>,
    isLoading: readonly(isLoading),
    isSaving: readonly(isSaving),
    error: readonly(error),
    isReady,

    utilityEngine,
    framework,
    iconSettings,
    enabledIconPacks,
    defaultIconPack,
    analytics,
    customCode,
    generalSettings,
    seoDefaults,
    discoverySettings,
    contentLocalization,
    activeAnalyticsProviders,

    loadSettings,
    saveSettings,
    resetSettings,
    isIconPackEnabled,
    toggleIconPack,
    setDefaultIconPack,
    updateIconSettings,
    isAnalyticsProviderActive,
    activateAnalyticsProvider,
    deactivateAnalyticsProvider,
    removeAnalyticsProvider,
    setAnalyticsProviderField,
    setStudioCloudflareTraffic,
    updateGeneralSettings,
    updateSeoDefaults,
    updateContentLocalization,
    updateDiscoverySettings,
    replaceDiscoverySettingsLocal,
    applySettingsActionResult,
    setCustomHeadCode,
    setCustomBodyCode,
    setCustomFooterCode,

    // Constants (for reference and fallback)
    ICON_PACK_CATALOG,
    DEFAULT_ICON_SETTINGS,
    ANALYTICS_PROVIDERS,
    ANALYTICS_PROVIDER_IDS,
  };
}

type UtilityEngine = "unocss" | "custom";

type SiteSettingsUpdate = Partial<SiteSettings> & {
  utilityEngine?: UtilityEngine;
};
