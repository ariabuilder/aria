import { computed, ref, watch } from "vue";
import { z } from "zod";

import { useDesignSystem } from "@/features/Design/composables/useDesignSystem";
import { useGlobalStyles } from "@/features/Design/composables/useGlobalStyles";
import {
  designSwatchAssignmentLabel,
  resolveDesignColorAssignmentValue,
} from "@/features/Design/lib/designSystemColorVariables";
import {
  paletteTokenSourceKey,
  semanticTokenSourceKey,
} from "@/features/Design/lib/variableManagerTokens";
import { log } from "@/lib/utils/logger";
import {
  COLOR_SHADES,
  ColorPaletteShadesSchema,
  SemanticColorsSchema,
} from "../../../../lib/design/types";
import type { ColorPaletteShades } from "../../../../lib/design/types";
import { generateNaturalShades } from "../../../../lib/design/shades";

const ColorPickerPaletteSchema = z
  .object({
    name: z.string().trim().min(1),
    label: z.string().trim().min(1),
    shades: ColorPaletteShadesSchema,
  })
  .strict();

const ColorPickerPaletteListSchema = z.array(ColorPickerPaletteSchema);

const SemanticColorKeySchema = z.enum(["success", "warning", "error", "info"]);

const ColorPickerSemanticOptionSchema = z
  .object({
    key: SemanticColorKeySchema,
    label: z.string().trim().min(1),
    color: z.string().trim().min(1),
    shades: ColorPaletteShadesSchema,
  })
  .strict();

const ColorPickerSemanticOptionListSchema = z.array(
  ColorPickerSemanticOptionSchema,
);

export type SemanticColorKey = z.infer<typeof SemanticColorKeySchema>;

export type ActiveDesignSwatch =
  | { kind: "palette"; name: string }
  | { kind: "semantic"; key: SemanticColorKey };

export type ActiveShadeSource =
  | {
      id: string;
      label: string;
      shades: ColorPaletteShades;
      kind: "palette";
    }
  | {
      id: SemanticColorKey;
      label: string;
      shades: ColorPaletteShades;
      kind: "semantic";
    };

export type DesignColorSelectOptions = {
  tokenSourceKey: string;
  fallbackColor: string;
  paletteName?: string;
  shade?: number;
  semanticKey?: SemanticColorKey;
};

function startCase(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function useColorPickerDesign(enabled: () => boolean) {
  const {
    palettes,
    semanticColors,
    isLoading: isDesignSystemLoading,
    load,
  } = useDesignSystem();
  const { globalStyles } = useGlobalStyles();

  const activeDesignSwatch = ref<ActiveDesignSwatch | null>(null);

  const designPalettes = computed(() => {
    if (!enabled()) {
      return [];
    }

    const parsedPalettes = ColorPickerPaletteListSchema.safeParse(
      palettes.value.map((palette) => ({
        name: palette.name,
        label: palette.label || startCase(palette.name),
        shades: palette.shades,
      })),
    );

    if (!parsedPalettes.success) {
      log("warn", "[ColorPicker] Invalid design palette data", {
        issues: parsedPalettes.error.issues,
      });
      return [];
    }

    return parsedPalettes.data.map((palette) => ({
      ...palette,
      baseColor: palette.shades.DEFAULT?.trim() || palette.shades[500],
    }));
  });

  const semanticColorOptions = computed(() => {
    if (!enabled()) {
      return [];
    }

    const parsedSemanticColors = SemanticColorsSchema.safeParse(
      semanticColors.value,
    );

    if (!parsedSemanticColors.success) {
      log("warn", "[ColorPicker] Invalid semantic color data", {
        issues: parsedSemanticColors.error.issues,
      });
      return [];
    }

    const parsedSemanticOptions = ColorPickerSemanticOptionListSchema.safeParse(
      SemanticColorKeySchema.options.map((key) => ({
        key,
        label: startCase(key),
        color: parsedSemanticColors.data[key],
        shades: generateNaturalShades(parsedSemanticColors.data[key]),
      })),
    );

    if (!parsedSemanticOptions.success) {
      log("warn", "[ColorPicker] Invalid semantic shade data", {
        issues: parsedSemanticOptions.error.issues,
      });
      return [];
    }

    return parsedSemanticOptions.data;
  });

  const activeShadeSource = computed((): ActiveShadeSource | null => {
    const active = activeDesignSwatch.value;
    if (!active) {
      return null;
    }

    if (active.kind === "palette") {
      const palette = designPalettes.value.find(
        (entry) => entry.name === active.name,
      );
      if (!palette) {
        return null;
      }

      return {
        id: palette.name,
        label: palette.label,
        shades: palette.shades,
        kind: "palette" as const,
      };
    }

    const option = semanticColorOptions.value.find(
      (entry) => entry.key === active.key,
    );
    if (!option) {
      return null;
    }

    return {
      id: option.key,
      label: option.label,
      shades: option.shades,
      kind: "semantic" as const,
    };
  });

  function syncActiveDesignSwatch(): void {
    const nextPalettes = designPalettes.value;
    const nextSemanticOptions = semanticColorOptions.value;

    if (nextPalettes.length === 0 && nextSemanticOptions.length === 0) {
      activeDesignSwatch.value = null;
      return;
    }

    const active = activeDesignSwatch.value;
    if (
      active?.kind === "palette" &&
      nextPalettes.some((palette) => palette.name === active.name)
    ) {
      return;
    }

    if (
      active?.kind === "semantic" &&
      nextSemanticOptions.some((option) => option.key === active.key)
    ) {
      return;
    }

    const firstPalette = nextPalettes[0];
    if (firstPalette) {
      activeDesignSwatch.value = { kind: "palette", name: firstPalette.name };
      return;
    }

    const firstSemantic = nextSemanticOptions[0];
    if (firstSemantic) {
      activeDesignSwatch.value = { kind: "semantic", key: firstSemantic.key };
    }
  }

  watch([designPalettes, semanticColorOptions], syncActiveDesignSwatch, {
    immediate: true,
  });

  function setActiveDesignSwatch(swatch: ActiveDesignSwatch): void {
    activeDesignSwatch.value = swatch;
  }

  function isActivePaletteSwatch(name: string): boolean {
    const active = activeDesignSwatch.value;
    return active?.kind === "palette" && active.name === name;
  }

  function isActiveSemanticSwatch(key: SemanticColorKey): boolean {
    const active = activeDesignSwatch.value;
    return active?.kind === "semantic" && active.key === key;
  }

  interface SelectDesignColorOptions {
    tokenSourceKey: string;
    fallbackColor: string;
    paletteName?: string;
    shade?: number;
    semanticKey?: SemanticColorKey;
  }

  function previewDesignColorAssignment(
    options: SelectDesignColorOptions,
  ): string {
    return resolveDesignColorAssignmentValue({
      variables: globalStyles.value.variables,
      palettes: palettes.value,
      semanticColors: semanticColors.value,
      tokenSourceKey: options.tokenSourceKey,
      paletteName: options.paletteName,
      shade: options.shade,
      semanticKey: options.semanticKey,
      fallbackColor: options.fallbackColor,
    });
  }

  function designSwatchTitle(options: SelectDesignColorOptions): string {
    return designSwatchAssignmentLabel(
      previewDesignColorAssignment(options),
      options.fallbackColor,
    );
  }

  return {
    COLOR_SHADES,
    palettes,
    semanticColors,
    isDesignSystemLoading,
    load,
    designPalettes,
    semanticColorOptions,
    activeDesignSwatch,
    activeShadeSource,
    setActiveDesignSwatch,
    isActivePaletteSwatch,
    isActiveSemanticSwatch,
    previewDesignColorAssignment,
    designSwatchTitle,
    paletteTokenSourceKey,
    semanticTokenSourceKey,
  };
}
