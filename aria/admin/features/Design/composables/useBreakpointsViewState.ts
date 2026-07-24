import {
  computed,
  onMounted,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import { toast } from "vue-sonner";

import { useStudioI18n } from "@/i18n";
import { log } from "@/lib/utils/logger";
import { useCanonicalBreakpoints } from "../../../composables/useCanonicalBreakpoints";
import {
  getBreakpointIconClass as resolveBreakpointIconClass,
  resolveBreakpointIconToken,
} from "../../../composables/breakpointIcons";
import type { UniversalBreakpointItem } from "../../../../lib/styles/universalDesignSystem";
import type { BreakpointEditForm } from "../composables/useCustomBreakpointsTable";

interface SystemDefaultInfo {
  id: string;
  label: string;
  iconClass: string;
  value: string;
  range: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  minWidth: number;
}

const EMPTY_BREAKPOINT_FORM: BreakpointEditForm = {
  label: "",
  width: "",
};

export function useBreakpointsViewState() {
  const { t } = useStudioI18n();
  const {
    breakpoints: settingsBreakpoints,
    loadBreakpoints,
    removeBreakpoint,
    addBreakpoint,
    updateBreakpoint,
  } = useCanonicalBreakpoints({ autoLoad: true });

  const localBreakpoints: Ref<UniversalBreakpointItem[]> = ref([]);
  const newBreakpoint: Ref<BreakpointEditForm> = ref({
    ...EMPTY_BREAKPOINT_FORM,
  });
  const showNewForm = ref(false);
  const editingId = ref<string | null>(null);
  const editValues: Ref<BreakpointEditForm> = ref({ ...EMPTY_BREAKPOINT_FORM });
  const isSaving = ref(false);
  const isLoading = ref(true);

  onMounted(async (): Promise<void> => {
    isLoading.value = true;
    try {
      await loadBreakpoints();
      localBreakpoints.value = [...settingsBreakpoints.value];
    } catch (error: unknown) {
      log("error", "Failed to load settings", {
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(t("design.breakpoints.toast.loadFailed"));
    } finally {
      isLoading.value = false;
    }
  });

  watch(
    settingsBreakpoints,
    (nextBreakpoints: readonly UniversalBreakpointItem[]): void => {
      localBreakpoints.value = [...nextBreakpoints];
    },
    { deep: true },
  );

  const sortedBreakpoints: ComputedRef<UniversalBreakpointItem[]> = computed(
    () => {
      return [...localBreakpoints.value].sort((a, b) => a.order - b.order);
    },
  );

  function defaultBreakpointLabel(id: string, fallback: string): string {
    switch (id) {
      case "base":
        return t("design.breakpoints.default.base");
      case "laptop":
        return t("design.breakpoints.default.laptop");
      case "tablet":
        return t("design.breakpoints.default.tablet");
      case "mobile":
        return t("design.breakpoints.default.mobile");
      default:
        return fallback;
    }
  }

  function defaultBreakpointDescription(id: string, fallback: string): string {
    switch (id) {
      case "base":
        return t("design.breakpoints.default.baseDescription");
      case "laptop":
        return t("design.breakpoints.default.laptopDescription");
      case "tablet":
        return t("design.breakpoints.default.tabletDescription");
      case "mobile":
        return t("design.breakpoints.default.mobileDescription");
      default:
        return t("design.breakpoints.default.customDescription", {
          label: fallback.toLowerCase(),
        });
    }
  }

  const systemDefaults = computed<SystemDefaultInfo[]>(() => {
    // Use the displayed width (canvasWidth falls back to minWidth) for
    // both sorting and range derivation so everything stays in sync.
    const resolveWidth = (bp: UniversalBreakpointItem): number =>
      bp.canvasWidth ?? bp.minWidth;

    const allByWidth = [...sortedBreakpoints.value].sort(
      (a, b) => resolveWidth(b) - resolveWidth(a),
    );

    return sortedBreakpoints.value
      .filter((bp) => bp.isDefault)
      .map((bp) => {
        const idx = allByWidth.findIndex((s) => s.id === bp.id);
        // The breakpoint before this in descending order = the next larger one
        const nextLarger = idx > 0 ? allByWidth[idx - 1] : null;

        const range = nextLarger ? `${resolveWidth(nextLarger) - 1}px` : "∞";

        return {
          id: bp.id,
          label: defaultBreakpointLabel(bp.id, bp.label),
          iconClass: resolveBreakpointIconClass(bp),
          value: String(bp.canvasWidth ?? bp.minWidth),
          range,
          description: defaultBreakpointDescription(bp.id, bp.label),
          enabled: bp.enabled,
          isDefault: bp.isDefault,
          minWidth: bp.minWidth,
        };
      });
  });

  const customBreakpoints = computed(() =>
    sortedBreakpoints.value.filter((bp) => !bp.isDefault),
  );

  const hasCustomBreakpoints = computed(
    () => customBreakpoints.value.length > 0,
  );

  function resetNewBreakpoint(): void {
    newBreakpoint.value = { ...EMPTY_BREAKPOINT_FORM };
  }

  function openNewForm(): void {
    resetNewBreakpoint();
    showNewForm.value = true;
  }

  function closeNewForm(): void {
    showNewForm.value = false;
    resetNewBreakpoint();
  }

  function startEdit(bp: UniversalBreakpointItem): void {
    editingId.value = bp.id;
    editValues.value = {
      label: bp.label,
      width: String(bp.canvasWidth ?? bp.minWidth),
    };
  }

  function cancelEdit(): void {
    editingId.value = null;
    editValues.value = { ...EMPTY_BREAKPOINT_FORM };
  }

  function parseBreakpointWidth(value: string): number | null {
    if (value === "") return null;

    const width = parseInt(value, 10);
    if (Number.isNaN(width) || width < 0) {
      throw new Error(t("design.breakpoints.toast.widthPositive"));
    }

    return width;
  }

  function resolveBreakpointIcon(breakpointId: string, width: number): string {
    return resolveBreakpointIconToken({
      id: breakpointId,
      width,
    });
  }

  function buildBreakpointId(label: string): string {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function createUniqueBreakpointId(label: string): string {
    const baseId = buildBreakpointId(label);

    if (!baseId) {
      throw new Error(t("design.breakpoints.toast.labelLetters"));
    }

    const existingIds = new Set(localBreakpoints.value.map((bp) => bp.id));
    if (!existingIds.has(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (existingIds.has(`${baseId}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseId}-${suffix}`;
  }

  function getBreakpointIconClass(bp: UniversalBreakpointItem): string {
    return resolveBreakpointIconClass({
      id: bp.id,
      icon: bp.icon,
      width: bp.canvasWidth ?? bp.minWidth,
    });
  }

  async function saveBreakpointEdit(
    id: string,
    values: BreakpointEditForm,
  ): Promise<void> {
    try {
      if (!values.label.trim()) {
        toast.error(t("design.breakpoints.toast.labelRequired"));
        return;
      }

      isSaving.value = true;
      const width = parseBreakpointWidth(values.width);
      const existing = settingsBreakpoints.value.find((bp) => bp.id === id);
      const resolvedWidth =
        width ?? existing?.canvasWidth ?? existing?.minWidth ?? 1280;

      await updateBreakpoint(id, {
        label: values.label.trim(),
        icon: resolveBreakpointIcon(id, resolvedWidth),
        minWidth: width ?? existing?.minWidth ?? resolvedWidth,
        canvasWidth: resolvedWidth,
      });

      localBreakpoints.value = [...settingsBreakpoints.value];
      toast.success(t("design.breakpoints.toast.updated"));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("design.breakpoints.toast.saveFailed");
      log("error", "Failed to save breakpoint", { error: message });
      toast.error(message);
    } finally {
      isSaving.value = false;
    }
  }

  async function addBreakpointFromForm(
    values: BreakpointEditForm,
  ): Promise<void> {
    if (!values.label.trim() || !values.width.trim()) {
      toast.error(t("design.breakpoints.toast.labelAndWidthRequired"));
      return;
    }

    isSaving.value = true;

    try {
      const width = parseBreakpointWidth(values.width);
      const resolvedWidth = width ?? 1280;
      const nextId = createUniqueBreakpointId(values.label);

      const nextBreakpoint: UniversalBreakpointItem = {
        id: nextId,
        label: values.label.trim(),
        icon: resolveBreakpointIcon(nextId, resolvedWidth),
        minWidth: resolvedWidth,
        canvasWidth: resolvedWidth,
        enabled: true,
        isDefault: false,
        order: localBreakpoints.value.length,
      };

      await addBreakpoint(nextBreakpoint);

      localBreakpoints.value = [...settingsBreakpoints.value];
      toast.success(t("design.breakpoints.toast.added"));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("design.breakpoints.toast.addFailed");
      log("error", "Failed to add breakpoint", { error: message });
      toast.error(message);
      throw error;
    } finally {
      isSaving.value = false;
    }
  }

  async function addNewBreakpoint(): Promise<void> {
    await addBreakpointFromForm(newBreakpoint.value);
    closeNewForm();
  }

  async function deleteBreakpointHandler(id: string): Promise<void> {
    try {
      isSaving.value = true;
      await removeBreakpoint(id);
      localBreakpoints.value = [...settingsBreakpoints.value];
      toast.success(t("design.breakpoints.toast.deleted"));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("design.breakpoints.toast.deleteFailed");
      log("error", "Failed to delete breakpoint", { error: message });
      toast.error(message);
    } finally {
      isSaving.value = false;
    }
  }

  async function setBreakpointEnabled(
    breakpointId: string,
    enabled: boolean,
  ): Promise<void> {
    const existing = settingsBreakpoints.value.find((b) => b.id === breakpointId);
    if (!existing || existing.enabled === enabled) {
      return;
    }

    try {
      await updateBreakpoint(breakpointId, { enabled });
      localBreakpoints.value = [...settingsBreakpoints.value];

      const label = defaultBreakpointLabel(
        existing.id,
        existing.label ?? breakpointId,
      );
      toast.success(
        enabled
          ? t("design.breakpoints.toast.enabled", { label })
          : t("design.breakpoints.toast.disabled", { label }),
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : t("design.breakpoints.toast.updateFailed");
      log("error", "Failed to update breakpoint", { error: message });
      toast.error(message);
    }
  }

  async function toggleBreakpointHandler(breakpointId: string): Promise<void> {
    const existing = settingsBreakpoints.value.find((b) => b.id === breakpointId);
    if (!existing) {
      return;
    }

    await setBreakpointEnabled(breakpointId, !existing.enabled);
  }

  function canToggleBreakpoint(breakpointId: string): boolean {
    return breakpointId !== "base";
  }

  return {
    localBreakpoints,
    newBreakpoint,
    showNewForm,
    editingId,
    editValues,
    isSaving,
    isLoading,
    sortedBreakpoints,

    systemDefaults,
    customBreakpoints,
    hasCustomBreakpoints,

    openNewForm,
    closeNewForm,
    startEdit,
    cancelEdit,
    addNewBreakpoint,
    addBreakpointFromForm,

    saveBreakpointEdit,
    deleteBreakpointHandler,
    setBreakpointEnabled,
    toggleBreakpointHandler,
    canToggleBreakpoint,
    getBreakpointIconClass,
  };
}
