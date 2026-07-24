import { ref, computed, type Ref, type ComputedRef } from "vue";
import { actions } from "astro:actions";
import {
  type LibraryInstalledSummary,
  type LibraryPackComponent,
  type LibraryPackItem,
  unwrapLibraryCatalogResult,
  unwrapLibraryInstallComponentResult,
  unwrapLibraryInstalledResult,
  unwrapLibraryInstallPackResult,
  unwrapLibraryPackDetailsResult,
  unwrapLibraryUninstallPackResult,
} from "./libraryActionResults";

interface ComponentLike {
  id: string;
  source?: "custom" | "aria";
  settings?: {
    copiedFromAriaComponentId?: string;
    [key: string]: unknown;
  };
}

export interface UseStudioLibraryOptions {
  searchQuery: Ref<string>;
  refreshComponents: () => Promise<void>;
  duplicateComponent: (componentId: string) => Promise<string | null>;
  components: ComputedRef<readonly ComponentLike[]>;
}

export function useStudioLibrary(options: UseStudioLibraryOptions) {
  const libraryCatalog = ref<LibraryPackItem[]>([]);
  const libraryInstalled = ref<LibraryInstalledSummary[]>([]);
  const libraryLoading = ref(false);
  const libraryError = ref<string | null>(null);
  const libraryActionError = ref<string | null>(null);
  const libraryActionSuccess = ref<string | null>(null);
  const libraryBusyPackId = ref<string | null>(null);
  const libraryBusyComponentId = ref<string | null>(null);
  const libraryCopyBusyComponentId = ref<string | null>(null);
  const ariaTierFilter = ref<"all" | "free" | "pro">("all");
  const selectedLibraryPackId = ref<string | null>(null);
  const selectedLibraryPackComponents = ref<LibraryPackComponent[]>([]);
  const selectedLibraryPackLoading = ref(false);
  const selectedLibraryPackError = ref<string | null>(null);
  const isUninstallPackDialogOpen = ref(false);
  const packToUninstall = ref<{ id: string; name: string } | null>(null);

  const selectedLibraryPack = computed(
    () =>
      libraryCatalog.value.find(
        (pack) => pack.id === selectedLibraryPackId.value,
      ) ?? null,
  );

  const customCopyByAriaComponentId = computed(() => {
    const map = new Map<string, string>();

    for (const component of options.components.value) {
      if (component.source !== "custom") continue;

      const copiedFromId = component.settings?.copiedFromAriaComponentId;
      if (!copiedFromId || map.has(copiedFromId)) continue;

      map.set(copiedFromId, component.id);
    }

    return map;
  });

  const installedAriaComponentIds = computed(() => {
    const installed = new Set<string>();
    for (const component of options.components.value) {
      if (component.source === "aria") {
        installed.add(component.id);
      }
    }
    return installed;
  });

  const selectedLibraryPackPreviewComponents = computed(() =>
    selectedLibraryPackComponents.value.map((component) => ({
      ...component,
      installed: installedAriaComponentIds.value.has(component.id),
      customCopyId: customCopyByAriaComponentId.value.get(component.id) ?? null,
    })),
  );

  const ariaPackCount = computed(() => libraryCatalog.value.length);
  const ariaInstalledCount = computed(
    () =>
      libraryCatalog.value.filter((pack) => pack.installState === "installed")
        .length,
  );

  async function loadInstalledLibraryPacks(): Promise<void> {
    const { data, error } = await actions.library.listInstalled({});
    const result = unwrapLibraryInstalledResult(
      { data, error },
      {
        source: "useStudioLibrary.loadInstalledLibraryPacks",
      },
    );

    if (!result.success) {
      return;
    }

    libraryInstalled.value = result.data.data;
  }

  async function loadLibraryCatalog(): Promise<void> {
    libraryLoading.value = true;
    libraryError.value = null;

    const input: { query?: string; tier?: "free" | "pro" } = {};
    const trimmedQuery = options.searchQuery.value.trim();
    if (trimmedQuery.length > 0) {
      input.query = trimmedQuery;
    }
    if (ariaTierFilter.value !== "all") {
      input.tier = ariaTierFilter.value;
    }

    const { data, error } = await actions.library.catalog(input);

    const result = unwrapLibraryCatalogResult(
      { data, error },
      {
        source: "useStudioLibrary.loadLibraryCatalog",
        query: input.query ?? null,
        tier: input.tier ?? "all",
      },
    );

    if (!result.success) {
      libraryError.value = result.error;
      libraryLoading.value = false;
      return;
    }

    libraryCatalog.value = result.data.data.packs;

    if (libraryCatalog.value.length === 0) {
      selectedLibraryPackId.value = null;
      selectedLibraryPackComponents.value = [];
      selectedLibraryPackError.value = null;
    } else {
      const hasCurrentSelection = selectedLibraryPackId.value
        ? libraryCatalog.value.some(
            (pack) => pack.id === selectedLibraryPackId.value,
          )
        : false;

      if (!hasCurrentSelection) {
        selectedLibraryPackId.value = libraryCatalog.value[0]?.id ?? null;
      }

      if (selectedLibraryPackId.value) {
        await loadSelectedLibraryPack();
      }
    }

    await loadInstalledLibraryPacks();
    libraryLoading.value = false;
  }

  function selectLibraryPack(packId: string): void {
    selectedLibraryPackId.value = packId;
  }

  async function loadSelectedLibraryPack(): Promise<void> {
    const pack = selectedLibraryPack.value;
    if (!pack) {
      selectedLibraryPackComponents.value = [];
      selectedLibraryPackError.value = null;
      return;
    }

    selectedLibraryPackLoading.value = true;
    selectedLibraryPackError.value = null;

    const { data, error } = await actions.library.pack({
      packId: pack.id,
      version: pack.version,
    });

    const result = unwrapLibraryPackDetailsResult(
      { data, error },
      `Failed to load ${pack.name}`,
      {
        source: "useStudioLibrary.loadSelectedLibraryPack",
        packId: pack.id,
        version: pack.version,
      },
    );

    if (!result.success) {
      selectedLibraryPackError.value = result.error;
      selectedLibraryPackComponents.value = [];
      selectedLibraryPackLoading.value = false;
      return;
    }

    selectedLibraryPackComponents.value = result.data.data.components;
    selectedLibraryPackLoading.value = false;
  }

  async function installLibraryPack(pack: LibraryPackItem): Promise<void> {
    libraryBusyPackId.value = pack.id;
    libraryActionError.value = null;
    libraryActionSuccess.value = null;

    const { data, error } = await actions.library.installPack({
      packId: pack.id,
      version: pack.version,
      force: false,
    });

    const result = unwrapLibraryInstallPackResult(
      { data, error },
      `Failed to install ${pack.name}`,
      {
        source: "useStudioLibrary.installLibraryPack",
        packId: pack.id,
        version: pack.version,
        force: false,
      },
    );

    if (!result.success) {
      libraryActionError.value = result.error;
      libraryBusyPackId.value = null;
      return;
    }

    libraryActionSuccess.value = `Installed ${pack.name} (${result.data.data.componentCount} components)`;
    await options.refreshComponents();
    await loadLibraryCatalog();
    libraryBusyPackId.value = null;
  }

  async function updateLibraryPack(pack: LibraryPackItem): Promise<void> {
    libraryBusyPackId.value = pack.id;
    libraryActionError.value = null;
    libraryActionSuccess.value = null;

    const { data, error } = await actions.library.installPack({
      packId: pack.id,
      version: pack.version,
      force: true,
    });

    const result = unwrapLibraryInstallPackResult(
      { data, error },
      `Failed to update ${pack.name}`,
      {
        source: "useStudioLibrary.updateLibraryPack",
        packId: pack.id,
        version: pack.version,
        force: true,
      },
    );

    if (!result.success) {
      libraryActionError.value = result.error;
      libraryBusyPackId.value = null;
      return;
    }

    libraryActionSuccess.value = `Updated ${pack.name} to ${result.data.data.version}`;
    await options.refreshComponents();
    await loadLibraryCatalog();
    libraryBusyPackId.value = null;
  }

  function requestUninstallLibraryPack(pack: LibraryPackItem): void {
    packToUninstall.value = {
      id: pack.id,
      name: pack.name,
    };
    window.setTimeout(() => {
      isUninstallPackDialogOpen.value = true;
    }, 0);
  }

  function cancelUninstallLibraryPack(): void {
    isUninstallPackDialogOpen.value = false;
    packToUninstall.value = null;
  }

  async function confirmUninstallLibraryPack(): Promise<void> {
    const pack = packToUninstall.value;
    if (!pack) return;

    libraryBusyPackId.value = pack.id;
    libraryActionError.value = null;
    libraryActionSuccess.value = null;

    const { data, error } = await actions.library.uninstallPack({
      packId: pack.id,
      force: false,
    });

    const result = unwrapLibraryUninstallPackResult(
      { data, error },
      `Failed to uninstall ${pack.name}`,
      {
        source: "useStudioLibrary.confirmUninstallLibraryPack",
        packId: pack.id,
        force: false,
      },
    );

    if (!result.success) {
      libraryActionError.value = result.error;
      libraryBusyPackId.value = null;
      isUninstallPackDialogOpen.value = false;
      packToUninstall.value = null;
      return;
    }

    libraryActionSuccess.value = `Uninstalled ${pack.name}`;
    await options.refreshComponents();
    await loadLibraryCatalog();
    libraryBusyPackId.value = null;
    isUninstallPackDialogOpen.value = false;
    packToUninstall.value = null;
  }

  async function installLibraryComponent(componentId: string): Promise<void> {
    const pack = selectedLibraryPack.value;
    if (!pack) return;

    libraryBusyComponentId.value = componentId;
    libraryActionError.value = null;
    libraryActionSuccess.value = null;

    const { data, error } = await actions.library.installComponent({
      packId: pack.id,
      version: pack.version,
      componentId,
      force: false,
    });

    const result = unwrapLibraryInstallComponentResult(
      { data, error },
      `Failed to install ${componentId}`,
      {
        source: "useStudioLibrary.installLibraryComponent",
        packId: pack.id,
        version: pack.version,
        componentId,
        force: false,
      },
    );

    if (!result.success) {
      libraryActionError.value = result.error;
      libraryBusyComponentId.value = null;
      return;
    }

    libraryActionSuccess.value =
      result.data.data.action === "already_installed"
        ? `${componentId} is already installed`
        : `Installed ${componentId}`;

    await options.refreshComponents();
    await loadLibraryCatalog();
    libraryBusyComponentId.value = null;
  }

  async function saveLibraryComponentAsCustom(
    componentId: string,
  ): Promise<void> {
    if (!installedAriaComponentIds.value.has(componentId)) {
      libraryActionError.value =
        "Install this component first, then save a custom copy.";
      return;
    }

    libraryCopyBusyComponentId.value = componentId;
    libraryActionError.value = null;
    libraryActionSuccess.value = null;

    const createdSlug = await options.duplicateComponent(componentId);
    if (!createdSlug) {
      libraryActionError.value = `Failed to save ${componentId} as custom`;
      libraryCopyBusyComponentId.value = null;
      return;
    }

    libraryActionSuccess.value = `Saved ${componentId} to My Components as ${createdSlug}`;
    await options.refreshComponents();
    libraryCopyBusyComponentId.value = null;
  }

  function getCustomCopyIdForLibraryComponent(
    componentId: string,
  ): string | null {
    return customCopyByAriaComponentId.value.get(componentId) ?? null;
  }

  return {
    libraryCatalog,
    libraryInstalled,
    libraryLoading,
    libraryError,
    libraryActionError,
    libraryActionSuccess,
    libraryBusyPackId,
    libraryBusyComponentId,
    libraryCopyBusyComponentId,
    ariaTierFilter,
    selectedLibraryPackId,
    selectedLibraryPackComponents,
    selectedLibraryPackLoading,
    selectedLibraryPackError,
    selectedLibraryPack,
    selectedLibraryPackPreviewComponents,
    ariaPackCount,
    ariaInstalledCount,
    isUninstallPackDialogOpen,
    packToUninstall,
    loadLibraryCatalog,
    loadSelectedLibraryPack,
    selectLibraryPack,
    installLibraryPack,
    updateLibraryPack,
    requestUninstallLibraryPack,
    cancelUninstallLibraryPack,
    confirmUninstallLibraryPack,
    installLibraryComponent,
    saveLibraryComponentAsCustom,
    getCustomCopyIdForLibraryComponent,
  };
}
