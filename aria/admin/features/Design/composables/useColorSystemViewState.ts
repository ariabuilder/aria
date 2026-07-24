import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
} from "vue";
import { toast } from "vue-sonner";

import { useStudioI18n } from "@/i18n";
import {
  PALETTE_TEMPLATES,
  expandTemplateToPalettes,
} from "@/lib/design/palettes";
import {
  evaluateContrastPair,
  formatContrastRatio,
  type ContrastEvaluation,
} from "../../../../lib/design/colorContrast";
import type {
  ColorPaletteShades,
  PaletteTemplate,
} from "../../../../lib/design/types";
import { useDesignSystem } from "./useDesignSystem";
import type { ColorShade } from "../types";

export interface AccessibilityPairCard {
  id: string;
  label: string;
  foreground: string;
  background: string;
  evaluation: ContrastEvaluation | null;
  ratioLabel: string;
  largeLabel: string;
  normalLabel: string;
}

export const SEMANTIC_TOKENS = [
  {
    key: "success" as const,
    label: "Success",
    var: "--success",
    icon: "i-hugeicons:checkmark-circle-02",
    usage: "Positive confirmation, completed states",
  },
  {
    key: "warning" as const,
    label: "Warning",
    var: "--warning",
    icon: "i-hugeicons:alert-01",
    usage: "Caution, pending, or attention needed",
  },
  {
    key: "error" as const,
    label: "Destructive",
    var: "--destructive",
    icon: "i-hugeicons:shield-ban",
    usage: "Errors, destructive actions, critical alerts",
  },
  {
    key: "info" as const,
    label: "Info",
    var: "--info",
    icon: "i-hugeicons:information-circle",
    usage: "Neutral guidance and informational callouts",
  },
] as const;

export const COLOR_SHADES = [
  25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const satisfies readonly ColorShade[];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  if (target.isContentEditable) return true;

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function formatContrastBadge(
  evaluation: ContrastEvaluation | null,
  failLabel: string,
): {
  largeLabel: string;
  normalLabel: string;
  ratioLabel: string;
} {
  if (!evaluation) {
    return {
      largeLabel: "—",
      normalLabel: "—",
      ratioLabel: "—",
    };
  }

  const ratioLabel = formatContrastRatio(evaluation.ratio) || "—";
  const largeLabel = evaluation.aaaLarge
    ? "AAA"
    : evaluation.aaLarge
      ? "AA"
      : failLabel;
  const normalLabel = evaluation.aaaNormal
    ? "AAA"
    : evaluation.aaNormal
      ? "AA"
      : failLabel;

  return { largeLabel, normalLabel, ratioLabel };
}

export function useColorSystemViewState() {
  const { t } = useStudioI18n();
  const designSystem = useDesignSystem();
  const {
    palettes,
    semanticColors,
    isLoading,
    isApplyingTemplate,
    isSaving,
    lastError,
    canUndo,
    canRedo,
    currentTemplateId,
    addPalette,
    removePalette,
    updatePaletteBaseColor,
    renamePalette,
    updateSemanticColor,
    generateShadesFromColor,
    getTextColorForBackground,
    undo,
    redo,
    save,
    load,
  } = designSystem;

  const showAddModal = ref(false);
  const newPaletteName = ref("");
  const newPaletteColor = ref("#3b82f6");
  const newPaletteVarName = ref("");
  const renamingId = ref<string | null>(null);
  const renameValue = ref("");
  const renamingVarId = ref<string | null>(null);
  const renameVarValue = ref("");
  const copiedSwatch = ref<string | null>(null);

  const templates = Object.values(PALETTE_TEMPLATES) as PaletteTemplate[];
  const selectedTemplateId = ref<string | null>(null);
  const applyingTemplateId = ref<string | null>(null);
  const previewTemplate = ref<PaletteTemplate | null>(null);

  const primaryPalette = computed(() =>
    palettes.value.find((palette) => palette.name === "primary"),
  );
  const neutralPalette = computed(() =>
    palettes.value.find((palette) => palette.name === "neutral"),
  );
  const previewPrimaryBg = computed(
    () => primaryPalette.value?.shades[600] ?? "#2563eb",
  );
  const previewPrimaryText = computed(() =>
    getTextColorForBackground(previewPrimaryBg.value),
  );
  const previewOutlineBorder = computed(
    () => primaryPalette.value?.shades[400] ?? "#60a5fa",
  );
  const previewOutlineText = computed(
    () => primaryPalette.value?.shades[500] ?? "#3b82f6",
  );
  const previewLinkColor = computed(
    () => primaryPalette.value?.shades[500] ?? "#3b82f6",
  );

  const semanticShadeMap: ComputedRef<
    Record<
      (typeof SEMANTIC_TOKENS)[number]["key"],
      ReturnType<typeof generateShadesFromColor>
    >
  > = computed(() => ({
    success: generateShadesFromColor(semanticColors.value.success),
    warning: generateShadesFromColor(semanticColors.value.warning),
    error: generateShadesFromColor(semanticColors.value.error),
    info: generateShadesFromColor(semanticColors.value.info),
  }));

  const accessibilityPairs = computed((): AccessibilityPairCard[] => {
    const surface =
      neutralPalette.value?.shades[50] ??
      neutralPalette.value?.shades[25] ??
      "#fafafa";
    const textOnSurface =
      neutralPalette.value?.shades[900] ??
      neutralPalette.value?.shades[950] ??
      "#171717";
    const primaryFg =
      primaryPalette.value?.shades[500] ??
      primaryPalette.value?.shades.DEFAULT ??
      "#3b82f6";
    const destructiveFg = semanticColors.value.error;

    const pairs: Array<{
      id: string;
      label: string;
      foreground: string;
      background: string;
    }> = [
      {
        id: "primary-on-neutral",
        label: t("design.colors.accessibility.primaryOnNeutral"),
        foreground: primaryFg,
        background: surface,
      },
      {
        id: "text-on-neutral",
        label: t("design.colors.accessibility.textOnNeutral"),
        foreground: textOnSurface,
        background: surface,
      },
      {
        id: "destructive-on-neutral",
        label: t("design.colors.accessibility.destructiveOnNeutral"),
        foreground: destructiveFg,
        background: surface,
      },
    ];

    return pairs.map((pair) => {
      const evaluation = evaluateContrastPair({
        foreground: pair.foreground,
        background: pair.background,
      });
      const badges = formatContrastBadge(
        evaluation,
        t("design.colors.accessibility.fail"),
      );
      return {
        ...pair,
        evaluation,
        ...badges,
      };
    });
  });

  function getShadeHex(
    palette: { shades: ColorPaletteShades },
    shade: ColorShade,
  ): string {
    return (
      (palette.shades as unknown as Record<number, string>)[shade] ?? "#000000"
    );
  }

  function getSemanticShadeHex(
    key: (typeof SEMANTIC_TOKENS)[number]["key"],
    shade: ColorShade,
  ): string {
    return semanticShadeMap.value[key][shade] ?? semanticColors.value[key];
  }

  const SEMANTIC_SCALE_STOPS: ColorShade[] = [25, 100, 300, 500, 700, 950];

  function getSemanticContrastBadge(
    key: (typeof SEMANTIC_TOKENS)[number]["key"],
  ): string {
    const surface =
      neutralPalette.value?.shades[50] ??
      neutralPalette.value?.shades[25] ??
      "#fafafa";
    const evaluation = evaluateContrastPair({
      foreground: semanticColors.value[key],
      background: surface,
    });
    if (!evaluation) return "—";
    if (evaluation.aaaNormal) return "AAA";
    if (evaluation.aaNormal) return "AA";
    if (evaluation.aaLarge) return t("design.colors.accessibility.aaLarge");
    return t("design.colors.accessibility.fail");
  }

  function getSemanticTokenLabel(
    key: (typeof SEMANTIC_TOKENS)[number]["key"],
  ): string {
    return t(`design.colors.semantic.${key}`);
  }

  async function copySwatchHex(hex: string, id: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(hex);
      copiedSwatch.value = id;
      toast.success(t("design.colors.copiedHex", { hex }));
      window.setTimeout(() => {
        if (copiedSwatch.value === id) copiedSwatch.value = null;
      }, 1500);
      return true;
    } catch {
      toast.error(t("design.colors.copyFailed"));
      return false;
    }
  }

  function startRename(paletteName: string): void {
    renamingId.value = paletteName;
    const palette = palettes.value.find((entry) => entry.name === paletteName);
    renameValue.value = palette?.label ?? paletteName;
    nextTick(() => {
      const input = document.getElementById(
        `rename-${paletteName}`,
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function commitRename(paletteName: string): void {
    if (renameValue.value.trim()) {
      renamePalette(paletteName, paletteName, renameValue.value.trim());
    }
    renamingId.value = null;
  }

  function cancelRename(): void {
    renamingId.value = null;
  }

  function startVarRename(paletteName: string): void {
    renamingVarId.value = paletteName;
    renameVarValue.value = paletteName;
    nextTick(() => {
      const input = document.getElementById(
        `var-rename-${paletteName}`,
      ) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  function commitVarRename(paletteName: string): void {
    const newName = renameVarValue.value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-");

    if (newName && newName !== paletteName) {
      const palette = palettes.value.find(
        (entry) => entry.name === paletteName,
      );
      renamePalette(paletteName, newName, palette?.label ?? newName);
    }

    renamingVarId.value = null;
  }

  function cancelVarRename(): void {
    renamingVarId.value = null;
  }

  function openAddModal(): void {
    newPaletteName.value = "";
    newPaletteColor.value = "#3b82f6";
    newPaletteVarName.value = "";
    showAddModal.value = true;
  }

  function closeAddModal(): void {
    showAddModal.value = false;
  }

  function handleAddPalette(): void {
    const label = newPaletteName.value.trim();
    const varName =
      newPaletteVarName.value.trim() ||
      label.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    if (!label) return;

    const added = addPalette(varName, newPaletteColor.value, label);
    if (!added) {
      toast.error(t("design.colors.addFailed"), {
        description:
          lastError.value ?? t("design.colors.addFailedDescription"),
      });
      return;
    }

    closeAddModal();
    toast.success(t("design.colors.paletteAdded", { label }));
  }

  function selectTemplate(id: string): void {
    selectedTemplateId.value = id;
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) previewTemplate.value = tmpl;
  }

  function clearTemplatePreview(): void {
    if (!selectedTemplateId.value) {
      previewTemplate.value = null;
    }
  }

  function getTemplatePreviewRows(tmpl: PaletteTemplate): string[][] {
    const expanded = expandTemplateToPalettes(tmpl);
    const previewStops: ColorShade[] = [50, 300, 500, 700, 950];

    return (["primary", "secondary", "muted", "neutral"] as const).map(
      (role) => previewStops.map((shade) => expanded[role][shade]),
    );
  }

  async function applySelectedTemplate(templateId?: string): Promise<void> {
    const id = templateId ?? selectedTemplateId.value;
    if (!id || isApplyingTemplate.value) return;

    const template = templates.find((t) => t.id === id);
    applyingTemplateId.value = id;

    try {
      const ok = await designSystem.applyTemplate(id);
      if (ok) {
        toast.success(
          t("design.colors.templateApplied", { name: template?.name ?? id }),
        );
        selectedTemplateId.value = null;
        previewTemplate.value = null;
        return;
      }

      toast.error(t("design.colors.templateApplyFailed"), {
        description: lastError.value ?? t("design.colors.tryAgain"),
      });
    } finally {
      applyingTemplateId.value = null;
    }
  }

  async function handleSave(): Promise<void> {
    await save();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) {
      return;
    }

    const isMeta = event.metaKey || event.ctrlKey;
    if (isMeta && event.key === "z" && !event.shiftKey && canUndo.value) {
      event.preventDefault();
      undo();
    }

    if (
      ((isMeta && event.shiftKey && event.key === "z") ||
        (isMeta && event.key === "y")) &&
      canRedo.value
    ) {
      event.preventDefault();
      redo();
    }
  }

  onMounted(async () => {
    await load();
    document.addEventListener("keydown", handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  return {
    palettes,
    semanticColors,
    isLoading,
    isApplyingTemplate,
    applyingTemplateId,
    isSaving,
    canUndo,
    canRedo,
    currentTemplateId,
    removePalette,
    updatePaletteBaseColor,
    updateSemanticColor,
    getTextColorForBackground,
    showAddModal,
    newPaletteName,
    newPaletteColor,
    newPaletteVarName,
    renamingId,
    renameValue,
    renamingVarId,
    renameVarValue,
    copiedSwatch,
    previewPrimaryBg,
    previewPrimaryText,
    previewOutlineBorder,
    previewOutlineText,
    previewLinkColor,
    accessibilityPairs,
    getShadeHex,
    getSemanticShadeHex,
    getSemanticContrastBadge,
    getSemanticTokenLabel,
    SEMANTIC_SCALE_STOPS,
    copySwatchHex,
    startRename,
    commitRename,
    cancelRename,
    startVarRename,
    commitVarRename,
    cancelVarRename,
    openAddModal,
    closeAddModal,
    handleAddPalette,
    handleSave,
    templates,
    selectedTemplateId,
    previewTemplate,
    selectTemplate,
    clearTemplatePreview,
    getTemplatePreviewRows,
    applySelectedTemplate,
    semanticShadeMap,
  };
}
