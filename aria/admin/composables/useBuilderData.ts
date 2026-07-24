/**
 * Singleton builder resource state (pages, layouts, components) with cache + dedupe.
 */
import {
  ref,
  computed,
  readonly,
  shallowRef,
  type Ref,
  type ComputedRef,
} from "vue";
import { actions } from "astro:actions";
import { z } from "zod";
import { traceStartup } from "@/lib/startupTrace";
import { PageInventoryAuthorshipSchema } from "../../lib/authorship/schemas";
import { UserPreferencesSchema } from "../../lib/schemas/userPreferences";
import type { UserPreferences } from "../../lib/schemas/userPreferences";

/**
 * Publication status
 */
type PublicationStatus = "draft" | "published" | "scheduled" | "archived";

type PageSystemRole = "standard" | "not-found" | "cms-collection" | "cms-entry";

type PageAccessMode = "public" | "password" | "private" | "unlisted";

const ThumbnailStateSchema = z.object({
  url: z.string().optional(),
  status: z.enum(["missing", "queued", "running", "ready", "stale", "failed"]),
  stage: z.enum(["default", "draft", "published"]),
  fingerprint: z.string(),
  updatedAt: z.string().nullable().optional(),
  error: z.string().optional(),
});

const ServerPageSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  slug: z.string().optional(),
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  isModifiedSincePublish: z.boolean().optional(),
  layout: z.string().nullable().optional(),
  systemRole: z
    .enum(["standard", "not-found", "cms-collection", "cms-entry"])
    .optional(),
  accessMode: z.enum(["public", "password", "private", "unlisted"]).optional(),
  hasPassword: z.boolean().optional(),
  snapshotUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnail: ThumbnailStateSchema.optional(),
  featuredImage: z
    .object({
      src: z.string(),
      alt: z.string().optional(),
      caption: z.string().optional(),
    })
    .optional(),
  description: z.string().optional(),
  parent: z.string().optional(),
  order: z.number().optional(),
  updatedAt: z.string().nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
  authorship: PageInventoryAuthorshipSchema.optional(),
});

/** Page metadata from builder — inferred from server action schema. */
type Page = z.infer<typeof ServerPageSchema> & {
  readonly title: string;
  readonly slug: string;
  readonly status: PublicationStatus;
  readonly isModifiedSincePublish: boolean;
  readonly layout: string;
  readonly updatedAt: string | null;
  readonly scheduledFor: string | null;
};

/**
 * Layout metadata from builder
 * Matches server response structure from listLayoutsDSL
 */
interface Layout {
  readonly id: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly updatedAt: string | null;
}

/**
 * Component metadata from builder
 * Matches server response structure from listComponentsDSL
 */
interface Component {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly source?: "custom" | "aria";
  readonly tier?: "free" | "pro";
  readonly isLocked?: boolean;
  readonly packId?: string;
  readonly version?: string;
  readonly snapshotUrl?: string;
  readonly thumbnailUrl?: string;
  readonly updatedAt: string | null;
}

const ServerLayoutSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});

const ServerComponentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["custom", "aria"]).optional(),
  tier: z.enum(["free", "pro"]).optional(),
  isLocked: z.boolean().optional(),
  packId: z.string().optional(),
  version: z.string().optional(),
  snapshotUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  updatedAt: z.string().nullable().optional(),
});

const InitActionResponseSchema = z.object({
  pages: z.array(ServerPageSchema),
  layouts: z.array(ServerLayoutSchema),
  components: z.array(ServerComponentSchema),
  config: z.record(z.string(), z.unknown()).optional(),
  // Loose passthrough — the canonical type lives in
  // `aria/lib/storage/adapter.ts`; we only need the blob shape here so
  // consumers (e.g. `useAppearance`) can read `.appearance` without a
  // second round-trip to `actions.settings.get`.
  siteSettings: z.record(z.string(), z.unknown()).nullable().optional(),
  userPreferences: UserPreferencesSchema.nullable().optional(),
});

/**
 * Raw site settings blob returned by `actions.init`. Consumers should
 * narrow this with the `SiteSettings` type from `aria/lib/storage/adapter`.
 */
export type SiteSettingsBlob = Record<string, unknown>;

const PageInventoryActionResponseSchema = z.object({
  pages: z.array(ServerPageSchema),
});

/**
 * Fetch options
 */
interface FetchOptions {
  /** Force refresh even if already loaded */
  readonly force?: boolean;
  /** Silent mode (no error toasts) */
  readonly silent?: boolean;
}

/**
 * Composable return type
 */
interface UseBuilderDataReturn {
  /** All pages */
  readonly pages: Ref<readonly Page[]>;
  /** All layouts */
  readonly layouts: Ref<readonly Layout[]>;
  /** All components */
  readonly components: Ref<readonly Component[]>;
  /**
   * Site settings blob captured from the `init` action so consumers can avoid
   * a second `settings.get` round-trip on cold boot. `null` until init resolves
   * or when the server returned no settings.
   */
  readonly siteSettings: Ref<SiteSettingsBlob | null>;
  /** Parsed user preferences from init (appearance, etc.) */
  readonly userPreferences: Ref<UserPreferences | null>;
  /** Whether data has been loaded */
  readonly isInitialized: Ref<boolean>;
  /** Whether currently fetching data */
  readonly isLoading: Ref<boolean>;
  /** Last fetch error if any */
  readonly error: Ref<string | null>;
  /** Total resource counts */
  readonly counts: ComputedRef<{
    pages: number;
    layouts: number;
    components: number;
    total: number;
  }>;
  /** Whether data is ready (initialized and not loading) */
  readonly isReady: ComputedRef<boolean>;
  /** Fetch all builder data */
  readonly fetchBuilderData: (options?: FetchOptions) => Promise<void>;
  /** Refresh specific resource collection */
  readonly refreshPages: () => Promise<void>;
  readonly refreshPagesNow: () => Promise<void>;
  readonly refreshLayouts: () => Promise<void>;
  readonly refreshComponents: () => Promise<void>;
  /** Always re-fetch builder data; use after mutations (bulk delete, etc.). */
  readonly refreshComponentsNow: () => Promise<void>;
  /** Find resource by id */
  readonly findPageById: (id: string) => Page | undefined;
  readonly findLayoutById: (id: string) => Layout | undefined;
  readonly findComponentById: (id: string) => Component | undefined;
  /** Clear error state */
  readonly clearError: () => void;
  /** Reset all state */
  readonly reset: () => void;
  /** Optimistically remove pages from inventory; returns rollback closure. */
  readonly applyOptimisticPageRemoval: (slugs: readonly string[]) => () => void;
  /** Optimistically remove components from inventory; returns rollback closure. */
  readonly applyOptimisticComponentRemoval: (ids: readonly string[]) => () => void;
}

// MODULE STATE (SINGLETON)

/**
 * All pages (using shallowRef for large arrays)
 */
const pages = shallowRef<Page[]>([]);

/**
 * All layouts
 */
const layouts = shallowRef<Layout[]>([]);

/**
 * All components
 */
const components = shallowRef<Component[]>([]);

/**
 * Site settings blob returned by `actions.init`. Hydrated on first successful
 * fetch and reused by `useAppearance` to skip the duplicate `settings.get`
 * action on cold boot.
 */
const siteSettings = shallowRef<SiteSettingsBlob | null>(null);

const userPreferences = shallowRef<UserPreferences | null>(null);

/**
 * Whether data has been initialized
 */
const isInitialized = ref<boolean>(false);

/**
 * Whether currently loading
 */
const isLoading = ref<boolean>(false);

/**
 * Last error message
 */
const error = ref<string | null>(null);

/**
 * In-flight fetch promise for deduplication
 */
let fetchPromise: Promise<void> | null = null;

/**
 * In-flight pages-only refresh promise for deduplication
 */
let pagesFetchPromise: Promise<void> | null = null;

/**
 * Timestamp of last successful full builder fetch
 */
let lastBuilderFetchTime = 0;

/**
 * Timestamp of last successful page inventory fetch
 */
let lastPagesFetchTime = 0;

/**
 * Minimum time (ms) between forced refetches to avoid redundant calls
 * during rapid navigation. Set to 5 seconds.
 */
const STALE_THRESHOLD_MS = 5_000;

/**
 * Transform server page DTO to client model
 * Server already returns in correct format from listPagesDSL
 */
function transformPage(serverPage: unknown): Page {
  const parsed = ServerPageSchema.safeParse(serverPage);
  if (!parsed.success) {
    return {
      id: "",
      title: "Untitled Page",
      slug: "",
      status: "draft",
      isModifiedSincePublish: false,
      layout: "",
      systemRole: "standard",
      accessMode: "public",
      hasPassword: false,
      updatedAt: null,
      scheduledFor: null,
    };
  }

  const page = parsed.data;
  const status: PublicationStatus =
    page.status === "published" ||
    page.status === "archived" ||
    page.status === "scheduled"
      ? page.status
      : "draft";
  return {
    id: page.id,
    title: page.title || "Untitled Page",
    slug: page.slug || page.id,
    status,
    isModifiedSincePublish: page.isModifiedSincePublish ?? false,
    layout: page.layout || "",
    systemRole: page.systemRole ?? "standard",
    accessMode: page.accessMode ?? "public",
    hasPassword: page.hasPassword ?? false,
    snapshotUrl: page.snapshotUrl,
    thumbnailUrl: page.thumbnailUrl,
    thumbnail: page.thumbnail,
    featuredImage: page.featuredImage,
    description: page.description,
    parent: page.parent,
    order: page.order,
    updatedAt: page.updatedAt || null,
    scheduledFor: page.scheduledFor ?? null,
    authorship: page.authorship,
  };
}

/**
 * Transform server layout DTO to client model
 * Server already returns in correct format from listLayoutsDSL
 */
function transformLayout(serverLayout: unknown): Layout {
  const parsed = ServerLayoutSchema.safeParse(serverLayout);
  if (!parsed.success) {
    return {
      id: "",
      name: "Unnamed Layout",
      updatedAt: null,
    };
  }

  const layout = parsed.data;
  const resolvedName =
    layout.title ||
    (layout.name && /^[a-z]+(-[a-z]+)*$/.test(layout.name)
      ? layout.name
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : layout.name) ||
    "Unnamed Layout";
  return {
    id: layout.id,
    name: resolvedName,
    title: layout.title,
    description: layout.description,
    updatedAt: layout.updatedAt || null,
  };
}

/**
 * Transform server component DTO to client model
 * Server already returns in correct format from listComponentsDSL
 */
function transformComponent(serverComponent: unknown): Component {
  const parsed = ServerComponentSchema.safeParse(serverComponent);
  if (!parsed.success) {
    return {
      id: "",
      name: "Unnamed Component",
      category: "custom",
      source: "custom",
      tier: "free",
      isLocked: false,
      updatedAt: null,
    };
  }

  const component = parsed.data;
  const source: "custom" | "aria" =
    component.source === "aria" ? "aria" : "custom";

  return {
    id: component.id,
    name: component.name || "Unnamed Component",
    description: component.description,
    category: component.category || "custom",
    source,
    tier: component.tier === "pro" ? "pro" : "free",
    isLocked:
      typeof component.isLocked === "boolean"
        ? component.isLocked
        : source === "aria",
    packId: typeof component.packId === "string" ? component.packId : undefined,
    version:
      typeof component.version === "string" ? component.version : undefined,
    snapshotUrl:
      typeof component.snapshotUrl === "string"
        ? component.snapshotUrl
        : undefined,
    thumbnailUrl:
      typeof component.thumbnailUrl === "string"
        ? component.thumbnailUrl
        : undefined,
    updatedAt: component.updatedAt || null,
  };
}

/**
 * Fetch all builder data from server
 */
async function performFetch(): Promise<void> {
  try {
    traceStartup("builder-data:perform-fetch:start");
    const { data, error: actionError } = await actions.init();

    if (actionError) {
      throw new Error(actionError.message || "Failed to fetch builder data");
    }

    const parsedResponse = InitActionResponseSchema.safeParse(data);
    if (!parsedResponse.success) {
      throw new Error("Invalid response structure from init action");
    }

    // Transform server DTOs to client models
    const transformedPages = parsedResponse.data.pages.map(transformPage);
    const transformedLayouts = parsedResponse.data.layouts.map(transformLayout);
    const transformedComponents =
      parsedResponse.data.components.map(transformComponent);

    // Update state
    pages.value = transformedPages;
    layouts.value = transformedLayouts;
    components.value = transformedComponents;
    siteSettings.value = parsedResponse.data.siteSettings ?? null;
    userPreferences.value = parsedResponse.data.userPreferences ?? null;
    isInitialized.value = true;
    const fetchedAt = Date.now();
    lastBuilderFetchTime = fetchedAt;
    lastPagesFetchTime = fetchedAt;
    traceStartup("builder-data:perform-fetch:end", {
      pages: transformedPages.length,
      layouts: transformedLayouts.length,
      components: transformedComponents.length,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    console.error("[useBuilderData] Fetch failed:", err);
    error.value = errorMessage;
    traceStartup("builder-data:perform-fetch:error", {
      error: errorMessage,
    });

    throw err;
  }
}

/**
 * Fetch only page inventory metadata from server
 */
async function performPagesFetch(): Promise<void> {
  try {
    traceStartup("builder-data:perform-pages-fetch:start");
    const { data, error: actionError } = await actions.pages.listInventory();

    if (actionError) {
      throw new Error(actionError.message || "Failed to fetch page inventory");
    }

    const parsedResponse = PageInventoryActionResponseSchema.safeParse(data);
    if (!parsedResponse.success) {
      throw new Error("Invalid response structure from page inventory action");
    }

    const transformedPages = parsedResponse.data.pages.map(transformPage);

    pages.value = transformedPages;
    lastPagesFetchTime = Date.now();
    traceStartup("builder-data:perform-pages-fetch:end", {
      pages: transformedPages.length,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    console.error("[useBuilderData] Page inventory fetch failed:", err);
    error.value = errorMessage;
    traceStartup("builder-data:perform-pages-fetch:error", {
      error: errorMessage,
    });

    throw err;
  }
}

/**
 * Singleton builder resource cache
 *
 * @example
 * ```vue
 * <script setup>
 * const {
 *   pages,
 *   layouts,
 *   components,
 *   isLoading,
 *   fetchBuilderData,
 *   findPageBySlug
 * } = useBuilderData();
 *
 * // Load data on mount
 * onMounted(async () => {
 *   await fetchBuilderData();
 * });
 *
 * // Find specific page
 * const currentPage = computed(() => findPageBySlug(route.params.slug));
 * </script>
 * ```
 */
export function useBuilderData(): UseBuilderDataReturn {

  /**
   * Resource counts
   */
  const counts = computed(() => ({
    pages: pages.value.length,
    layouts: layouts.value.length,
    components: components.value.length,
    total: pages.value.length + layouts.value.length + components.value.length,
  }));

  /**
   * Whether data is ready to use
   */
  const isReady = computed<boolean>(
    () => isInitialized.value && !isLoading.value && !error.value,
  );

  /**
   * Fetch all builder data with deduplication
   */
  async function fetchBuilderData(options: FetchOptions = {}): Promise<void> {
    // Skip if already loaded and not forcing refresh
    if (isInitialized.value && !options.force) {
      if (isLoading.value && fetchPromise) {
        // Wait for in-flight request
        traceStartup("builder-data:fetch:reuse-inflight", {
          force: Boolean(options.force),
        });
        return fetchPromise;
      }

      traceStartup("builder-data:fetch:skip-initialized", {
        force: Boolean(options.force),
      });
      return;
    }

    // Deduplicate concurrent requests
    if (isLoading.value && fetchPromise) {
      traceStartup("builder-data:fetch:dedupe", {
        force: Boolean(options.force),
      });
      return fetchPromise;
    }

    if (pagesFetchPromise) {
      await pagesFetchPromise;
    }

    isLoading.value = true;
    error.value = null;
    traceStartup("builder-data:fetch:dispatch", {
      force: Boolean(options.force),
      silent: Boolean(options.silent),
    });

    fetchPromise = performFetch()
      .catch((err) => {
        if (!options.silent) {
          // Error already logged in performFetch
        }
        throw err;
      })
      .finally(() => {
        isLoading.value = false;
        fetchPromise = null;
        traceStartup("builder-data:fetch:settled", {
          initialized: isInitialized.value,
          hasError: Boolean(error.value),
        });
      });

    return fetchPromise;
  }

  /**
   * Refresh only pages (skips if data was recently fetched)
   */
  async function refreshPages(): Promise<void> {
    if (Date.now() - lastPagesFetchTime < STALE_THRESHOLD_MS) return;
    await refreshPagesNow();
  }

  async function refreshPagesNow(): Promise<void> {
    if (isLoading.value && fetchPromise) {
      return fetchPromise;
    }

    if (pagesFetchPromise) {
      return pagesFetchPromise;
    }

    isLoading.value = true;
    error.value = null;

    pagesFetchPromise = performPagesFetch().finally(() => {
      isLoading.value = false;
      pagesFetchPromise = null;
      traceStartup("builder-data:pages-fetch:settled", {
        initialized: isInitialized.value,
        hasError: Boolean(error.value),
      });
    });

    return pagesFetchPromise;
  }

  /**
   * Refresh only layouts (skips if data was recently fetched)
   */
  async function refreshLayouts(): Promise<void> {
    if (Date.now() - lastBuilderFetchTime < STALE_THRESHOLD_MS) return;
    await fetchBuilderData({ force: true });
  }

  /**
   * Refresh only components (skips if data was recently fetched)
   */
  async function refreshComponents(): Promise<void> {
    if (Date.now() - lastBuilderFetchTime < STALE_THRESHOLD_MS) return;
    await refreshComponentsNow();
  }

  /**
   * Always re-fetch all builder data so component list reflects recent CRUD.
   * Individual deletes call `refreshComponents()`, which is throttled — after
   * bulk delete/duplicate, call this once so every removal appears in the UI.
   */
  async function refreshComponentsNow(): Promise<void> {
    await fetchBuilderData({ force: true });
  }

  /**
   * Find page by id
   */
  function findPageById(id: string): Page | undefined {
    return pages.value.find((page) => page.id === id);
  }

  /**
   * Find layout by id
   */
  function findLayoutById(id: string): Layout | undefined {
    return layouts.value.find((layout) => layout.id === id);
  }

  /**
   * Find component by id
   */
  function findComponentById(id: string): Component | undefined {
    return components.value.find((component) => component.id === id);
  }

  /**
   * Clear error state
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Reset all state to initial values
   */
  function reset(): void {
    pages.value = [];
    layouts.value = [];
    components.value = [];
    siteSettings.value = null;
    userPreferences.value = null;
    isInitialized.value = false;
    isLoading.value = false;
    error.value = null;
    fetchPromise = null;
    pagesFetchPromise = null;
    lastBuilderFetchTime = 0;
    lastPagesFetchTime = 0;

    console.info("[useBuilderData] State reset");
    traceStartup("builder-data:reset");
  }

  function applyOptimisticPageRemoval(slugs: readonly string[]): () => void {
    const slugSet = new Set(slugs);
    const snapshot = pages.value;
    pages.value = pages.value.filter((page) => !slugSet.has(page.slug));
    return () => {
      pages.value = snapshot;
    };
  }

  function applyOptimisticComponentRemoval(ids: readonly string[]): () => void {
    const idSet = new Set(ids);
    const snapshot = components.value;
    components.value = components.value.filter(
      (component) => !idSet.has(component.id),
    );
    return () => {
      components.value = snapshot;
    };
  }

  return {
    // State (readonly to prevent external mutation)
    pages: readonly(pages) as Ref<readonly Page[]>,
    layouts: readonly(layouts) as Ref<readonly Layout[]>,
    components: readonly(components) as Ref<readonly Component[]>,
    siteSettings: readonly(siteSettings) as Ref<SiteSettingsBlob | null>,
    userPreferences: readonly(userPreferences) as Ref<UserPreferences | null>,
    isInitialized: readonly(isInitialized) as Ref<boolean>,
    isLoading: readonly(isLoading) as Ref<boolean>,
    error: readonly(error) as Ref<string | null>,
    counts,
    isReady,

    // Actions
    fetchBuilderData,
    refreshPages,
    refreshPagesNow,
    refreshLayouts,
    refreshComponents,
    refreshComponentsNow,

    // Queries
    findPageById,
    findLayoutById,
    findComponentById,

    // Utilities
    clearError,
    reset,
    applyOptimisticPageRemoval,
    applyOptimisticComponentRemoval,
  };
}

export type {
  Page,
  Layout,
  Component,
  PublicationStatus,
  PageSystemRole,
  PageAccessMode,
};
