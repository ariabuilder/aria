import { computed, onMounted, ref, type Ref } from "vue";
import { actions } from "astro:actions";
import { log } from "@/lib/utils/logger";
import {
  unwrapSiteExportDeleteResult,
  unwrapSiteExportInventoryResult,
  unwrapSiteExportListResult,
  unwrapSiteExportPayloadResult,
} from "./siteExportActionResults";
import { createDefaultSiteExportSelection } from "../../../../../lib/export/selection";
import type {
  SiteExportSection,
  SiteExportSelection,
} from "../../../../../lib/export/cmsTypes";

/** ~100 years — matches the UI "Keep forever" retention preset. */
export const EXPORT_KEEP_TTL_MINUTES = 52_560_000;

export interface ExportInventoryItem {
  id: string;
  title: string;
}

export interface CmsEntryInventoryItem extends ExportInventoryItem {
  count: number;
}

export interface ExportInventory {
  pages: ExportInventoryItem[];
  layouts: ExportInventoryItem[];
  components: ExportInventoryItem[];
  cmsCollections: ExportInventoryItem[];
  cmsEntries: CmsEntryInventoryItem[];
}

export interface SiteExportRecord {
  id: string;
  filename: string;
  createdAt: string;
  expiresAt: string;
  pageCount: number;
  mediaCount: number;
  cmsCollectionCount?: number;
  cmsEntryCount?: number;
  redirectCount?: number;
  sizeBytes: number;
  downloadPath: string;
}

export interface SiteExportGroup {
  key: "pages" | "layouts" | "components" | "cmsCollections" | "cmsEntries";
  label: string;
  icon: string;
  items: Array<ExportInventoryItem | CmsEntryInventoryItem>;
}

export interface UseSiteExportReturn {
  isLoadingExportInventory: Ref<boolean>;
  isLoadingExports: Ref<boolean>;
  isCreatingExport: Ref<boolean>;
  deletingExportId: Ref<string | null>;
  exportError: Ref<string | null>;
  exportTtlMinutes: Ref<number>;
  exportSelection: Ref<SiteExportSelection>;
  exportInventory: Ref<ExportInventory>;
  exports: Ref<SiteExportRecord[]>;
  latestExport: Readonly<Ref<SiteExportRecord | null>>;
  totalExportableItems: Readonly<Ref<number>>;
  exportGroups: Readonly<Ref<SiteExportGroup[]>>;
  loadExportInventory: () => Promise<void>;
  loadExports: () => Promise<void>;
  createSiteExport: () => Promise<void>;
  setExportPreset: (
    preset: Exclude<SiteExportSelection["preset"], "custom">,
  ) => void;
  toggleExportSection: (section: SiteExportSection, enabled: boolean) => void;
  deleteExport: (id: string) => Promise<void>;
  downloadExport: (record: SiteExportRecord) => void;
  refresh: () => Promise<void>;
  formatDateTime: (value: string) => string;
  formatRelativeExpiry: (value: string, createdAt?: string) => string;
  formatExportExpiry: (record: SiteExportRecord) => string;
  formatBytes: (value: number) => string;
  formatExportTitle: (record: SiteExportRecord) => string;
}

interface UseSiteExportOptions {
  navigate?: (path: string) => void;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function isKeepForeverExport(record: {
  createdAt: string;
  expiresAt: string;
}): boolean {
  const created = new Date(record.createdAt).getTime();
  const expires = new Date(record.expiresAt).getTime();

  if (Number.isNaN(created) || Number.isNaN(expires)) {
    return false;
  }

  const ttlMinutes = (expires - created) / 60_000;
  return ttlMinutes >= EXPORT_KEEP_TTL_MINUTES * 0.99;
}

export function formatExportExpiry(record: SiteExportRecord): string {
  if (isKeepForeverExport(record)) {
    return "Never expires";
  }

  return `Expires ${formatDateTime(record.expiresAt)}`;
}

function formatRelativeExpiry(value: string, createdAt?: string): string {
  if (createdAt && isKeepForeverExport({ createdAt, expiresAt: value })) {
    return "Never expires";
  }

  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) {
    return value;
  }

  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) {
    return "Expired";
  }

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) {
    return `${minutes}m left`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h left`;
  }

  const days = Math.floor(hours / 24);
  if (days < 60) {
    return `${days}d left`;
  }

  return formatDateTime(value);
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatExportTitle(record: SiteExportRecord): string {
  const match = record.filename.match(
    /aria-site-export-(\d{4}-\d{2}-\d{2})T(\d{2}-\d{2}-\d{2})/,
  );

  if (match) {
    const [, datePart, timePart] = match;
    const isoCandidate = `${datePart}T${timePart.replace(/-/g, ":")}Z`;
    const parsed = new Date(isoCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(parsed);
    }
  }

  return formatDateTime(record.createdAt);
}

export function useSiteExport(
  icons: {
    fileCode: string;
    layout: string;
    component: string;
    cmsCollection?: string;
    cmsEntry?: string;
  },
  options: UseSiteExportOptions = {},
): UseSiteExportReturn {
  const navigate =
    options.navigate ??
    ((path: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(path);
      }
    });
  const isLoadingExportInventory = ref(false);
  const isLoadingExports = ref(false);
  const isCreatingExport = ref(false);
  const deletingExportId = ref<string | null>(null);
  const exportError = ref<string | null>(null);
  const exportTtlMinutes = ref(15);
  const exportSelection = ref<SiteExportSelection>(
    createDefaultSiteExportSelection(),
  );
  const exportInventory = ref<ExportInventory>({
    pages: [],
    layouts: [],
    components: [],
    cmsCollections: [],
    cmsEntries: [],
  });
  const exportsList = ref<SiteExportRecord[]>([]);

  const latestExport = computed(() => exportsList.value[0] ?? null);

  const totalExportableItems = computed(
    () =>
      exportInventory.value.pages.length +
      exportInventory.value.layouts.length +
      exportInventory.value.components.length +
      exportInventory.value.cmsCollections.length +
      exportInventory.value.cmsEntries.reduce(
        (total, item) => total + item.count,
        0,
      ),
  );

  const exportGroups = computed<SiteExportGroup[]>(() => [
    {
      key: "pages",
      label: "Pages",
      icon: icons.fileCode,
      items: exportInventory.value.pages,
    },
    {
      key: "layouts",
      label: "Layouts",
      icon: icons.layout,
      items: exportInventory.value.layouts,
    },
    {
      key: "components",
      label: "Components",
      icon: icons.component,
      items: exportInventory.value.components,
    },
    {
      key: "cmsCollections",
      label: "CMS Collections",
      icon: icons.cmsCollection ?? icons.component,
      items: exportInventory.value.cmsCollections,
    },
    {
      key: "cmsEntries",
      label: "CMS Entries",
      icon: icons.cmsEntry ?? icons.fileCode,
      items: exportInventory.value.cmsEntries,
    },
  ]);

  async function loadExportInventory(): Promise<void> {
    isLoadingExportInventory.value = true;
    try {
      const result = unwrapSiteExportInventoryResult(
        await actions.importExport.list(),
        "Failed to load export inventory",
        {
          source: "useSiteExport.loadExportInventory",
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      exportInventory.value = {
        pages: result.data.pages,
        layouts: result.data.layouts,
        components: result.data.components,
        cmsCollections: result.data.cmsCollections,
        cmsEntries: result.data.cmsEntries,
      };
    } catch (error) {
      log("error", "[useSiteExport] Failed to load export inventory", {
        error,
      });
      exportInventory.value = {
        pages: [],
        layouts: [],
        components: [],
        cmsCollections: [],
        cmsEntries: [],
      };
    } finally {
      isLoadingExportInventory.value = false;
    }
  }

  async function loadExports(): Promise<void> {
    isLoadingExports.value = true;
    exportError.value = null;

    try {
      const result = unwrapSiteExportListResult(
        await actions.siteExport.list(),
        "Failed to load exports",
        {
          source: "useSiteExport.loadExports",
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      exportsList.value = result.data.exports;
    } catch (error) {
      exportsList.value = [];
      exportError.value =
        error instanceof Error ? error.message : "Failed to load exports";
    } finally {
      isLoadingExports.value = false;
    }
  }

  function setExportPreset(
    preset: Exclude<SiteExportSelection["preset"], "custom">,
  ): void {
    exportSelection.value = createDefaultSiteExportSelection();
    exportSelection.value = {
      ...exportSelection.value,
      preset,
      sections: undefined,
    };
  }

  function toggleExportSection(
    section: SiteExportSection,
    enabled: boolean,
  ): void {
    exportSelection.value = {
      ...exportSelection.value,
      preset: "custom",
      sections: {
        ...exportSelection.value.sections,
        [section]: enabled,
      },
    };
  }

  async function createSiteExport(): Promise<void> {
    isCreatingExport.value = true;
    exportError.value = null;

    try {
      const ttlMinutes = Math.max(1, Number(exportTtlMinutes.value) || 15);
      const result = unwrapSiteExportPayloadResult(
        await actions.siteExport.create({
          ttlMinutes,
          selection: exportSelection.value,
        }),
        "Failed to generate export",
        {
          source: "useSiteExport.createSiteExport",
          ttlMinutes,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      if (result.data.export) {
        exportsList.value = [
          result.data.export,
          ...exportsList.value.filter(
            (record) => record.id !== result.data.export?.id,
          ),
        ];
      } else {
        await loadExports();
      }
    } catch (error) {
      exportError.value =
        error instanceof Error ? error.message : "Failed to generate export";
    } finally {
      isCreatingExport.value = false;
    }
  }

  async function deleteExport(id: string): Promise<void> {
    deletingExportId.value = id;
    exportError.value = null;

    try {
      const result = unwrapSiteExportDeleteResult(
        await actions.siteExport.delete({ id }),
        "Failed to delete export",
        {
          source: "useSiteExport.deleteExport",
          exportId: id,
        },
      );
      if (!result.success) {
        throw new Error(result.error);
      }

      exportsList.value = exportsList.value.filter(
        (record) => record.id !== id,
      );
    } catch (error) {
      exportError.value =
        error instanceof Error ? error.message : "Failed to delete export";
    } finally {
      deletingExportId.value = null;
    }
  }

  function downloadExport(record: SiteExportRecord): void {
    navigate(record.downloadPath);
  }

  async function refresh(): Promise<void> {
    await Promise.all([loadExportInventory(), loadExports()]);
  }

  onMounted(() => {
    void refresh();
  });

  return {
    isLoadingExportInventory,
    isLoadingExports,
    isCreatingExport,
    deletingExportId,
    exportError,
    exportTtlMinutes,
    exportSelection,
    exportInventory,
    exports: exportsList,
    latestExport,
    totalExportableItems,
    exportGroups,
    loadExportInventory,
    loadExports,
    createSiteExport,
    setExportPreset,
    toggleExportSection,
    deleteExport,
    downloadExport,
    refresh,
    formatDateTime,
    formatRelativeExpiry,
    formatExportExpiry,
    formatBytes,
    formatExportTitle,
  };
}
