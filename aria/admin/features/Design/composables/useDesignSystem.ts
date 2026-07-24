/**
 * Manage design system colors, palettes, and templates.
 * Loads and saves through Astro actions.
 */

import { ref, computed, type Ref, type ComputedRef } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { z } from "zod";
import { designTokensState } from "./useDesignTokens";
import { log } from "@/lib/utils/logger";
import { useSiteSettings } from "@/composables/useSiteSettings";
import { useDesignSystemHistory } from "./useDesignSystemHistory";

// Import from design module
import type {
  ColorPaletteShades,
  PaletteTemplate,
  DesignSystemColors,
  SemanticColors,
} from "../../../../lib/design/types";
import {
  ColorPaletteShadesSchema,
  DesignSystemColorsSchema,
  SemanticColorsSchema,
} from "../../../../lib/design/types";
import {
  PALETTE_TEMPLATES,
  TEMPLATE_IDS,
  getTemplate,
  getDefaultTemplate,
  normalizeTemplateId,
  expandTemplateToPalettes,
} from "../../../../lib/design/palettes";
import {
  generateNaturalShades,
  generateMutedPalette,
  isLightColor,
  getContrastText,
} from "../../../../lib/design/shades";
import {
  exportToJSON,
  importFromJSON,
  downloadExport,
  isValidHexColor,
  type ImportResult,
} from "../../../../lib/design/export";

/**
 * Internal palette type with label for UI display
 */
interface UIPalette {
  name: string;
  label: string;
  shades: ColorPaletteShades;
}

const NonEmptyStringSchema = z.string().trim().min(1);
const HexColorSchema = NonEmptyStringSchema.refine(isValidHexColor, {
  message: "Invalid hex color",
});

const UIPaletteSchema = z
  .object({
    name: NonEmptyStringSchema,
    label: NonEmptyStringSchema,
    shades: ColorPaletteShadesSchema,
  })
  .strict();

const DesignSystemHistorySnapshotSchema = z
  .object({
    templateId: NonEmptyStringSchema.optional(),
    palettes: z.array(UIPaletteSchema),
    semantic: SemanticColorsSchema,
    paletteAliases: z.record(z.string(), z.string()).optional(),
  })
  .strict();

const DesignSystemActionErrorSchema = z
  .looseObject({
    message: NonEmptyStringSchema.optional(),
  });

const DesignSystemApplyTemplateResultSchema = z
  .looseObject({
    success: z.boolean(),
    data: z
      .looseObject({
        templateId: NonEmptyStringSchema.optional(),
        templateName: NonEmptyStringSchema.optional(),
        colors: DesignSystemColorsSchema.optional(),
      }).optional(),
    error: DesignSystemActionErrorSchema.optional(),
  });

const DesignSystemSaveColorsPayloadSchema = z
  .object({
    colors: z
      .object({
        templateId: NonEmptyStringSchema.optional(),
        palettes: z.array(UIPaletteSchema),
        paletteAliases: z.record(z.string(), z.string()).optional(),
        semantic: SemanticColorsSchema,
      })
      .strict(),
  })
  .strict();

const DesignSystemSaveColorsResultSchema = z
  .looseObject({
    success: z.boolean(),
    data: z
      .looseObject({
        paletteCount: z.int().nonnegative().optional(),
        colors: DesignSystemColorsSchema.optional(),
      }).optional(),
    error: DesignSystemActionErrorSchema.optional(),
  });

const DesignSystemGetColorsResultSchema = z
  .looseObject({
    success: z.boolean(),
    data: z
      .looseObject({
        colors: DesignSystemColorsSchema.optional(),
      }).optional(),
    error: DesignSystemActionErrorSchema.optional(),
  });

const StyleRefreshResultSchema = z
  .looseObject({
    success: z.boolean(),
    framework: z.enum(["unocss", "custom"]),
    globalCSSHash: NonEmptyStringSchema.optional(),
    cssSize: z.number().nonnegative().optional(),
    classCount: z.number().nonnegative().optional(),
    lastCompiled: NonEmptyStringSchema.optional(),
    error: NonEmptyStringSchema.optional(),
  });

const AddPaletteInputSchema = z
  .object({
    name: NonEmptyStringSchema,
    baseColor: HexColorSchema,
    label: NonEmptyStringSchema.optional(),
  })
  .strict();

const RenamePaletteInputSchema = z
  .object({
    oldName: NonEmptyStringSchema,
    newName: NonEmptyStringSchema,
    label: NonEmptyStringSchema.optional(),
  })
  .strict();

const PaletteBaseColorUpdateSchema = z
  .object({
    name: NonEmptyStringSchema,
    baseColor: HexColorSchema,
  })
  .strict();

const SemanticColorKeySchema = z.enum(["success", "warning", "error", "info"]);

const SemanticColorUpdateSchema = z
  .object({
    key: SemanticColorKeySchema,
    color: HexColorSchema,
  })
  .strict();

type DesignSystemHistorySnapshot = z.infer<
  typeof DesignSystemHistorySnapshotSchema
>;

function getActionErrorMessage(
  error: z.infer<typeof DesignSystemActionErrorSchema> | undefined,
  fallback: string,
): string {
  return error?.message ?? fallback;
}

export interface UseDesignSystemReturn {
  currentTemplateId: Ref<string | undefined>;
  currentTemplate: ComputedRef<PaletteTemplate | undefined>;
  palettes: Ref<UIPalette[]>;
  semanticColors: Ref<SemanticColors>;
  isLoading: Ref<boolean>;
  isApplyingTemplate: Ref<boolean>;
  isSaving: Ref<boolean>;
  hasUnsavedChanges: Ref<boolean>;
  lastError: Ref<string | null>;

  canUndo: ComputedRef<boolean>;
  canRedo: ComputedRef<boolean>;

  availableTemplates: PaletteTemplate[];
  templateIds: string[];

  applyTemplate: (templateId: string) => Promise<boolean>;
  addPalette: (name: string, baseColor: string, label?: string) => boolean;
  removePalette: (name: string) => void;
  updatePalette: (name: string, shades: ColorPaletteShades) => void;
  updatePaletteBaseColor: (name: string, baseColor: string) => void;
  renamePalette: (oldName: string, newName: string, label?: string) => void;
  updateSemanticColor: (key: keyof SemanticColors, color: string) => void;

  undo: () => Promise<void>;
  redo: () => Promise<void>;

  save: () => Promise<boolean>;
  load: (force?: boolean) => Promise<void>;
  applyImportedColors: (colors: DesignSystemColors) => void;
  resetToDefaults: () => void;
  resetToLastSaved: () => void;

  exportJSON: (name?: string) => string;
  importJSON: (json: string) => ImportResult;
  downloadJSON: (filename?: string, name?: string) => void;

  generateShadesFromColor: (baseColor: string) => ColorPaletteShades;
  isColorLight: (color: string) => boolean;
  getTextColorForBackground: (bgColor: string) => string;
}

const currentTemplateId = ref<string | undefined>(undefined);
const palettes = ref<UIPalette[]>([]);
const paletteAliases = ref<Record<string, string>>({});
const semanticColors = ref<SemanticColors>({
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
});
const isLoading = ref(false);
const isApplyingTemplate = ref(false);
const isSaving = ref(false);
const hasUnsavedChanges = ref(false);
const lastError = ref<string | null>(null);
const committedSnapshot = ref<DesignSystemHistorySnapshot | null>(null);

// Auto-save debounce timer — persists after the last mutation (module-level singleton)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let loadDesignSystemPromise: Promise<void> | null = null;

const currentTemplate = computed(() => {
  if (!currentTemplateId.value) return undefined;
  return getTemplate(currentTemplateId.value);
});

const availableTemplates = Object.values(PALETTE_TEMPLATES);
const templateIds = TEMPLATE_IDS;

function normalizePaletteName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function clonePalette(palette: UIPalette): UIPalette {
  return {
    name: palette.name,
    label: palette.label,
    shades: { ...palette.shades },
  };
}

function createPaletteAliasEntries(
  paletteName: string,
  shades: ColorPaletteShades,
  targetPaletteName?: string,
): Record<string, string> {
  const aliases: Record<string, string> = {};
  const base = shades.DEFAULT?.trim() || shades[500]?.trim();
  if (base) {
    aliases[paletteName] = targetPaletteName
      ? `var(--${targetPaletteName})`
      : base;
  }

  for (const [shade, value] of Object.entries(shades)) {
    if (shade === "DEFAULT" || !value.trim()) {
      continue;
    }

    aliases[`${paletteName}-${shade}`] = targetPaletteName
      ? `var(--${targetPaletteName}-${shade})`
      : value;
  }

  return aliases;
}

function removePaletteAliasEntries(
  aliases: Record<string, string>,
  paletteName: string,
): void {
  for (const key of Object.keys(aliases)) {
    if (key === paletteName || key.startsWith(`${paletteName}-`)) {
      delete aliases[key];
    }
  }
}

function createTemplatePalettes(template: PaletteTemplate): UIPalette[] {
  const palettes = expandTemplateToPalettes(template);

  return [
    { name: "primary", label: "Primary", shades: { ...palettes.primary } },
    {
      name: "secondary",
      label: "Secondary",
      shades: { ...palettes.secondary },
    },
    { name: "muted", label: "Muted", shades: { ...palettes.muted } },
    { name: "neutral", label: "Neutral", shades: { ...palettes.neutral } },
  ];
}

export function useDesignSystem(): UseDesignSystemReturn {
  // SNAPSHOT HELPERS (for undo/redo)

  /**
   * Create a snapshot of current state for undo operations
   */
  const createSnapshot = (): DesignSystemHistorySnapshot =>
    DesignSystemHistorySnapshotSchema.parse({
      templateId: currentTemplateId.value,
      palettes: palettes.value.map(clonePalette),
      semantic: { ...semanticColors.value },
      paletteAliases: { ...paletteAliases.value },
    });

  const syncCommittedSnapshot = (snapshot?: DesignSystemHistorySnapshot) => {
    committedSnapshot.value = structuredClone(snapshot ?? createSnapshot());
    hasUnsavedChanges.value = false;
  };

  const refreshUnsavedChanges = (snapshot?: DesignSystemHistorySnapshot) => {
    if (!committedSnapshot.value) {
      hasUnsavedChanges.value = false;
      return;
    }

    hasUnsavedChanges.value =
      JSON.stringify(snapshot ?? createSnapshot()) !==
      JSON.stringify(committedSnapshot.value);
  };

  /**
   * Restore state from snapshot
   */
  const restoreSnapshot = (snapshot: DesignSystemHistorySnapshot) => {
    currentTemplateId.value = normalizeTemplateId(snapshot.templateId);
    palettes.value = snapshot.palettes.map(clonePalette);
    semanticColors.value = { ...snapshot.semantic };
    paletteAliases.value = { ...(snapshot.paletteAliases ?? {}) };
    syncToUnoConfigState();
    refreshUnsavedChanges(snapshot);
  };

  const { canUndo, canRedo, undo, redo, recordDesignSystemChange } =
    useDesignSystemHistory({
      snapshotSchema: DesignSystemHistorySnapshotSchema,
      captureSnapshot: createSnapshot,
      applySnapshot: restoreSnapshot,
      onSnapshotError: (message) => {
        lastError.value = message;
      },
    });

  const scheduleAutoSave = (): void => {
    if (autoSaveTimer !== null) {
      clearTimeout(autoSaveTimer);
    }
    // If a save is already in flight, skip — the mutation is in local state
    // and will be persisted on the next auto-save cycle
    if (isSaving.value) {
      return;
    }
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      void save({ silent: true });
    }, 500);
  };

  const queueDesignSystemChange = (
    type: Parameters<typeof recordDesignSystemChange>[0],
    description: string,
    action: () => void,
  ): void => {
    void recordDesignSystemChange(type, description, async () => {
      action();
      refreshUnsavedChanges();
      scheduleAutoSave();
    }).catch((error) => {
      lastError.value =
        error instanceof Error
          ? error.message
          : "Failed to update design system";
      log("error", "[useDesignSystem] Failed to record design-system change", {
        type,
        description,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const applyDefaultTemplate = (): void => {
    const defaultTemplate = getDefaultTemplate();
    const nextPaletteNames = new Set([
      "primary",
      "secondary",
      "muted",
      "neutral",
    ]);
    for (const palette of palettes.value) {
      if (!nextPaletteNames.has(palette.name)) {
        Object.assign(
          paletteAliases.value,
          createPaletteAliasEntries(palette.name, palette.shades),
        );
      }
    }

    currentTemplateId.value = defaultTemplate.id;
    palettes.value = createTemplatePalettes(defaultTemplate);
    semanticColors.value = { ...defaultTemplate.semantic };
  };

  const resetToDefaults = (): void => {
    queueDesignSystemChange(
      "apply-palette-template",
      "Reset colors to defaults",
      () => {
        applyDefaultTemplate();
        syncToUnoConfigState();
      },
    );
    lastError.value = null;
  };

  const resetToLastSaved = (): void => {
    if (!committedSnapshot.value) {
      return;
    }

    restoreSnapshot(committedSnapshot.value);
    lastError.value = null;
  };

  const applyTemplate = async (templateId: string): Promise<boolean> => {
    const parsedTemplateId = NonEmptyStringSchema.safeParse(templateId);
    if (!parsedTemplateId.success) {
      lastError.value =
        parsedTemplateId.error.issues[0]?.message ?? "Invalid template id";
      return false;
    }

    const template = getTemplate(parsedTemplateId.data);
    if (!template) {
      lastError.value = `Template "${parsedTemplateId.data}" not found`;
      return false;
    }

    isApplyingTemplate.value = true;
    lastError.value = null;

    try {
      await recordDesignSystemChange(
        "apply-palette-template",
        `Apply template: ${template.name}`,
        async () => {
          const result = await actions.designSystem.applyTemplate({
            templateId: parsedTemplateId.data,
          });

          if (result.error) {
            throw new Error(result.error.message);
          }

          const parsedResult = DesignSystemApplyTemplateResultSchema.safeParse(
            result.data,
          );
          if (!parsedResult.success) {
            log(
              "warn",
              "[useDesignSystem] Invalid applyTemplate response payload",
              {
                issues: parsedResult.error.issues,
              },
            );
            throw new Error("Invalid design system template response");
          }

          if (!parsedResult.data.success) {
            throw new Error(
              getActionErrorMessage(
                parsedResult.data.error,
                "Failed to apply template",
              ),
            );
          }

          const nextPaletteNames = new Set([
            "primary",
            "secondary",
            "muted",
            "neutral",
          ]);
          for (const palette of palettes.value) {
            if (!nextPaletteNames.has(palette.name)) {
              Object.assign(
                paletteAliases.value,
                createPaletteAliasEntries(palette.name, palette.shades),
              );
            }
          }

          currentTemplateId.value = parsedTemplateId.data;
          palettes.value = createTemplatePalettes(template);
          semanticColors.value = { ...template.semantic };
          syncToUnoConfigState();
        },
      );

      // Persist all four expanded palettes so a refresh returns the full scales
      await save({ silent: true });

      return true;
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "Failed to apply template";
      return false;
    } finally {
      isApplyingTemplate.value = false;
    }
  };

  const markAsCustom = (): void => {
    currentTemplateId.value = "custom";
  };

  const addPalette = (
    name: string,
    baseColor: string,
    label?: string,
  ): boolean => {
    const parsedInput = AddPaletteInputSchema.safeParse({
      name,
      baseColor,
      label,
    });
    if (!parsedInput.success) {
      lastError.value =
        parsedInput.error.issues[0]?.message ?? "Invalid palette input";
      return false;
    }

    const safeName = normalizePaletteName(parsedInput.data.name);
    if (!safeName) {
      lastError.value = "Palette name is invalid";
      return false;
    }

    if (palettes.value.some((p) => p.name === safeName)) {
      lastError.value = `Palette "${safeName}" already exists`;
      return false;
    }

    const shades = generateNaturalShades(parsedInput.data.baseColor);
    const newPalette: UIPalette = {
      name: safeName,
      label: parsedInput.data.label?.trim() ?? parsedInput.data.name.trim(),
      shades: {
        ...shades,
        DEFAULT: parsedInput.data.baseColor,
      },
    };

    queueDesignSystemChange(
      "add-palette",
      `Add palette: ${newPalette.label}`,
      () => {
        markAsCustom();
        removePaletteAliasEntries(paletteAliases.value, safeName);
        palettes.value.push(clonePalette(newPalette));
        syncToUnoConfigState();
      },
    );
    return true;
  };

  const removePalette = (name: string): void => {
    const parsedName = NonEmptyStringSchema.safeParse(name);
    if (!parsedName.success) {
      lastError.value =
        parsedName.error.issues[0]?.message ?? "Invalid palette name";
      return;
    }

    if (!palettes.value.some((palette) => palette.name === parsedName.data)) {
      return;
    }

    queueDesignSystemChange(
      "remove-palette",
      `Remove palette: ${parsedName.data}`,
      () => {
        markAsCustom();
        const index = palettes.value.findIndex(
          (palette) => palette.name === parsedName.data,
        );
        if (index === -1) {
          return;
        }

        Object.assign(
          paletteAliases.value,
          createPaletteAliasEntries(
            palettes.value[index]!.name,
            palettes.value[index]!.shades,
          ),
        );
        palettes.value.splice(index, 1);
        syncToUnoConfigState();
      },
    );
  };

  const updatePalette = (name: string, shades: ColorPaletteShades): void => {
    const parsedName = NonEmptyStringSchema.safeParse(name);
    const parsedShades = ColorPaletteShadesSchema.safeParse(shades);
    if (!parsedName.success || !parsedShades.success) {
      lastError.value =
        parsedName.error?.issues[0]?.message ??
        parsedShades.error?.issues[0]?.message ??
        "Invalid palette update";
      return;
    }

    const palette = palettes.value.find((p) => p.name === name);
    if (!palette) return;

    queueDesignSystemChange(
      "update-palette",
      `Update palette: ${parsedName.data}`,
      () => {
        markAsCustom();
        const targetPalette = palettes.value.find(
          (entry) => entry.name === parsedName.data,
        );
        if (!targetPalette) {
          return;
        }

        targetPalette.shades = { ...parsedShades.data };
        syncToUnoConfigState();
      },
    );
  };

  const updatePaletteBaseColor = (name: string, baseColor: string): void => {
    const parsedInput = PaletteBaseColorUpdateSchema.safeParse({
      name,
      baseColor,
    });
    if (!parsedInput.success) {
      lastError.value =
        parsedInput.error.issues[0]?.message ?? "Invalid palette base color";
      return;
    }

    const palette = palettes.value.find(
      (p) => p.name === parsedInput.data.name,
    );
    if (!palette) return;

    const shades = generateNaturalShades(parsedInput.data.baseColor);
    const newShades: ColorPaletteShades = {
      ...shades,
      DEFAULT: parsedInput.data.baseColor,
    };

    queueDesignSystemChange(
      "update-palette",
      `Update base color: ${parsedInput.data.name}`,
      () => {
        markAsCustom();
        const targetPalette = palettes.value.find(
          (entry) => entry.name === parsedInput.data.name,
        );
        if (!targetPalette) {
          return;
        }

        targetPalette.shades = { ...newShades };
        syncToUnoConfigState();
      },
    );
  };

  const renamePalette = (
    oldName: string,
    newName: string,
    label?: string,
  ): void => {
    const parsedInput = RenamePaletteInputSchema.safeParse({
      oldName,
      newName,
      label,
    });
    if (!parsedInput.success) {
      lastError.value =
        parsedInput.error.issues[0]?.message ?? "Invalid palette rename input";
      return;
    }

    const palette = palettes.value.find(
      (p) => p.name === parsedInput.data.oldName,
    );
    if (!palette) return;

    const safeName = normalizePaletteName(parsedInput.data.newName);
    if (!safeName) {
      lastError.value = "Palette name is invalid";
      return;
    }

    if (
      parsedInput.data.oldName !== safeName &&
      palettes.value.some((p) => p.name === safeName)
    ) {
      lastError.value = `Palette "${safeName}" already exists`;
      return;
    }

    queueDesignSystemChange(
      "rename-palette",
      `Rename palette: ${parsedInput.data.oldName} → ${parsedInput.data.newName}`,
      () => {
        markAsCustom();
        const targetPalette = palettes.value.find(
          (entry) => entry.name === parsedInput.data.oldName,
        );
        if (!targetPalette) {
          return;
        }

        targetPalette.name = safeName;
        targetPalette.label =
          parsedInput.data.label ?? parsedInput.data.newName.trim();
        if (parsedInput.data.oldName !== safeName) {
          removePaletteAliasEntries(paletteAliases.value, safeName);
          Object.assign(
            paletteAliases.value,
            createPaletteAliasEntries(
              parsedInput.data.oldName,
              targetPalette.shades,
              safeName,
            ),
          );
        }
        syncToUnoConfigState();
      },
    );
  };

  const updateSemanticColor = (
    key: keyof SemanticColors,
    color: string,
  ): void => {
    const parsedInput = SemanticColorUpdateSchema.safeParse({ key, color });
    if (!parsedInput.success) {
      lastError.value =
        parsedInput.error.issues[0]?.message ?? "Invalid semantic color update";
      return;
    }

    queueDesignSystemChange(
      "update-semantic-color",
      `Update ${parsedInput.data.key} color`,
      () => {
        markAsCustom();
        semanticColors.value[parsedInput.data.key] = parsedInput.data.color;
        syncToUnoConfigState();
      },
    );
  };

  /**
   * Convert UI palettes to DesignSystemColors format
   */
  const toDesignSystemColors = (): DesignSystemColors => {
    const palettesRecord: Record<string, ColorPaletteShades> = {};
    for (const palette of palettes.value) {
      palettesRecord[palette.name] = palette.shades;
    }
    return {
      activeTemplateId: currentTemplateId.value || "custom",
      palettes: palettesRecord,
      customPalettes: palettes.value.map((palette) => ({
        id: palette.name,
        name: palette.label,
        shades: { ...palette.shades },
        isCustom: true,
      })),
      paletteAliases: { ...paletteAliases.value },
      semantic: semanticColors.value,
    };
  };

  const save = async (options?: { silent?: boolean }): Promise<boolean> => {
    isSaving.value = true;
    lastError.value = null;

    try {
      const colors = toDesignSystemColors();
      const savePayload = DesignSystemSaveColorsPayloadSchema.parse({
        colors: {
          templateId: colors.activeTemplateId,
          palettes: palettes.value.map((p) => ({
            name: p.name,
            label: p.label,
            shades: p.shades,
          })),
          paletteAliases: colors.paletteAliases,
          semantic: colors.semantic,
        },
      });

      const result = await actions.designSystem.saveColors({
        colors: savePayload.colors,
      });

      if (result.error) {
        lastError.value = result.error.message;
        toast.error("Failed to save color system", {
          description: lastError.value,
        });
        return false;
      }

      const parsedSaveResult = DesignSystemSaveColorsResultSchema.safeParse(
        result.data,
      );
      if (!parsedSaveResult.success) {
        lastError.value = "Invalid save colors response";
        log("warn", "[useDesignSystem] Invalid saveColors response", {
          issues: parsedSaveResult.error.issues,
        });
        toast.error("Failed to save color system", {
          description: lastError.value,
        });
        return false;
      }

      if (!parsedSaveResult.data.success) {
        lastError.value = getActionErrorMessage(
          parsedSaveResult.data.error,
          "Failed to save color system",
        );
        toast.error("Failed to save color system", {
          description: lastError.value,
        });
        return false;
      }

      const parsedStyleRefresh = StyleRefreshResultSchema.safeParse(
        parsedSaveResult.data.data?.styleRefresh,
      );

      if (
        parsedSaveResult.data.data?.styleRefresh &&
        !parsedStyleRefresh.success
      ) {
        log("warn", "[useDesignSystem] Invalid styleRefresh payload", {
          issues: parsedStyleRefresh.error.issues,
        });
      }

      if (parsedStyleRefresh.success && !parsedStyleRefresh.data.success) {
        lastError.value =
          parsedStyleRefresh.data.error ??
          "Design tokens were saved, but render styles were not refreshed";
        if (!options?.silent) {
          toast.error("Color system saved with warnings", {
            description: lastError.value,
          });
        }
        return true;
      }

      if (!options?.silent) {
        toast.success("Color system saved", {
          description: "Design tokens and global CSS are now in sync.",
        });
      }

      syncCommittedSnapshot();

      return true;
    } catch (error) {
      lastError.value =
        error instanceof Error ? error.message : "Failed to save";
      toast.error("Failed to save color system", {
        description: lastError.value,
      });
      return false;
    } finally {
      isSaving.value = false;
    }
  };

  const load = async (force = false): Promise<void> => {
    if (palettes.value.length > 0 && !force) {
      return;
    }

    if (loadDesignSystemPromise && !force) {
      return loadDesignSystemPromise;
    }

    isLoading.value = true;
    lastError.value = null;

    loadDesignSystemPromise = (async () => {
      try {
        const result = await actions.designSystem.getColors();

        if (result.error) {
          lastError.value = result.error.message;
          return;
        }

        const parsedResult = DesignSystemGetColorsResultSchema.safeParse(
          result.data,
        );
        if (!parsedResult.success) {
          lastError.value = "Failed to load design system colors";
          log("warn", "[useDesignSystem] Invalid getColors response", {
            issues: parsedResult.error.issues,
          });
          return;
        }

        if (!parsedResult.data.success) {
          lastError.value = getActionErrorMessage(
            parsedResult.data.error,
            "Failed to load design system colors",
          );
          return;
        }

        const colors = parsedResult.data.data?.colors;

        if (colors) {
          const parsedColors = DesignSystemColorsSchema.safeParse(colors);
          if (!parsedColors.success) {
            lastError.value = "Failed to load design system colors";
            log(
              "warn",
              "[useDesignSystem] Invalid colors payload returned from action",
              {
                issues: parsedColors.error.issues,
              },
            );
            return;
          }

          loadFromDesignSystemColors(parsedColors.data);
        }

        if (palettes.value.length === 0) {
          applyDefaultTemplate();
        }

        syncToUnoConfigState();
        syncCommittedSnapshot();
      } catch (error) {
        lastError.value =
          error instanceof Error ? error.message : "Failed to load";
      } finally {
        isLoading.value = false;
        loadDesignSystemPromise = null;
      }
    })();

    return loadDesignSystemPromise;
  };

  const { generalSettings } = useSiteSettings({ autoLoad: true });

  const exportLabel = computed(() => {
    const siteName = generalSettings.value.siteName;
    if (siteName) return `Aria Design System — ${siteName}`;
    return "Aria Design System";
  });

  const exportJSONFn = (name?: string): string => {
    const colors = toDesignSystemColors();
    return exportToJSON(colors, { name: name || exportLabel.value });
  };

  const importJSONFn = (json: string): ImportResult => {
    const result = importFromJSON(json);

    if (result.success) {
      queueDesignSystemChange(
        "import-design-system",
        `Import design system${result.data.name ? `: ${result.data.name}` : ""}`,
        () => {
          loadFromDesignSystemColors(result.data.colors);
          syncToUnoConfigState();
        },
      );
    }

    return result;
  };

  const downloadJSONFn = (filename?: string, name?: string): void => {
    const colors = toDesignSystemColors();
    const resolvedName = name || exportLabel.value;
    downloadExport(colors, filename || resolvedName, { name: resolvedName });
  };

  const generateShadesFromColor = (baseColor: string): ColorPaletteShades => {
    const shades = generateNaturalShades(baseColor);
    return {
      ...shades,
      DEFAULT: baseColor,
    };
  };

  const syncToUnoConfigState = (): void => {
    for (const key of Object.keys(designTokensState.colors)) {
      delete designTokensState.colors[key];
    }

    for (const palette of palettes.value) {
      designTokensState.colors[palette.name] = { ...palette.shades };
    }

    designTokensState.colors.success = semanticColors.value.success;
    designTokensState.colors.warning = semanticColors.value.warning;
    designTokensState.colors.error = semanticColors.value.error;
    designTokensState.colors.info = semanticColors.value.info;

    for (const [aliasKey, aliasValue] of Object.entries(paletteAliases.value)) {
      designTokensState.colors[aliasKey] = aliasValue;
    }
  };

  const loadFromDesignSystemColors = (colors: DesignSystemColors): void => {
    currentTemplateId.value = normalizeTemplateId(colors.activeTemplateId);
    paletteAliases.value = { ...(colors.paletteAliases ?? {}) };
    const paletteMetadataById = new Map(
      (colors.customPalettes ?? []).map((palette) => [palette.id, palette]),
    );
    const loadedPalettes: UIPalette[] = Object.entries(colors.palettes).map(
      ([name, shades]) => ({
        name,
        label:
          paletteMetadataById.get(name)?.name ??
          name.charAt(0).toUpperCase() + name.slice(1),
        shades: {
          ...shades,
          DEFAULT: shades.DEFAULT || shades[500],
        },
      }),
    );

    // Backfill muted when older saves omitted it (neutral owns lights/darks).
    const paletteNames = new Set(loadedPalettes.map((p) => p.name));
    if (paletteNames.has("neutral") && !paletteNames.has("muted")) {
      const neutral = loadedPalettes.find((p) => p.name === "neutral")!;
      const mutedBase = neutral.shades[400] ?? neutral.shades[500] ?? "#a1a1aa";
      loadedPalettes.push({
        name: "muted",
        label: "Muted",
        shades: generateMutedPalette(mutedBase, neutral.shades),
      });
    }

    palettes.value = loadedPalettes;
    semanticColors.value = {
      ...colors.semantic,
    };
  };

  const applyImportedColors = (colors: DesignSystemColors): void => {
    loadFromDesignSystemColors(colors);
    syncToUnoConfigState();
    syncCommittedSnapshot();
  };

  return {
    currentTemplateId,
    currentTemplate,
    palettes,
    semanticColors,
    isLoading,
    isApplyingTemplate,
    isSaving,
    hasUnsavedChanges,
    lastError,

    canUndo,
    canRedo,

    availableTemplates,
    templateIds,

    applyTemplate,
    addPalette,
    removePalette,
    updatePalette,
    updatePaletteBaseColor,
    renamePalette,
    updateSemanticColor,

    undo,
    redo,

    save,
    load,
    applyImportedColors,
    resetToDefaults,
    resetToLastSaved,

    exportJSON: exportJSONFn,
    importJSON: importJSONFn,
    downloadJSON: downloadJSONFn,

    generateShadesFromColor,
    isColorLight: isLightColor,
    getTextColorForBackground: getContrastText,
  };
}
