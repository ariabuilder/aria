<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { COLOR_SHADES } from "../../../../lib/design/types";
import type {
  ActiveDesignSwatch,
  ActiveShadeSource,
  DesignColorSelectOptions,
  SemanticColorKey,
} from "./useColorPickerDesign";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  isLoading: boolean;
  designPalettes: ReadonlyArray<{
    name: string;
    label: string;
    baseColor: string;
  }>;
  semanticColorOptions: ReadonlyArray<{
    key: SemanticColorKey;
    label: string;
    color: string;
  }>;
  activeShadeSource: ActiveShadeSource | null;
  activeDesignSwatch: ActiveDesignSwatch | null;
  isActivePaletteSwatch: (name: string) => boolean;
  isActiveSemanticSwatch: (key: SemanticColorKey) => boolean;
  designSwatchTitle: (options: DesignColorSelectOptions) => string;
  paletteTokenSourceKey: (name: string, shade?: number) => string;
  semanticTokenSourceKey: (key: string, shade?: number) => string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  setActiveSwatch: [swatch: ActiveDesignSwatch];
  selectColor: [options: DesignColorSelectOptions];
}>();
const { t } = useStudioI18n();

function shadeSelectOptions(
  source: ActiveShadeSource,
  shade: number,
): DesignColorSelectOptions {
  const fallbackColor = shadeHex(source.shades, shade);

  if (source.kind === "palette") {
    return {
      tokenSourceKey: props.paletteTokenSourceKey(source.id, shade),
      fallbackColor,
      paletteName: source.id,
      shade,
    };
  }

  return {
    tokenSourceKey: props.semanticTokenSourceKey(source.id, shade),
    fallbackColor,
    semanticKey: source.id,
    shade,
  };
}

function shadeHex(
  shades: Record<number | "DEFAULT", string | undefined>,
  shade: number,
): string {
  return shades[shade]?.trim() ?? "#000000";
}

const COLUMN_LABEL_CLASS =
  "mb-2 text-3xs font-medium text-muted-foreground";

const SWATCH_BUTTON_CLASS = "h-4! w-6! shrink-0 rounded-sm! p-0!";

function swatchButtonClass(isActive: boolean): string {
  return isActive
    ? "border-primary ring-1 ring-primary/30"
    : "hover:border-primary/40";
}
</script>

<template>
  <div class="min-w-0 space-y-6 overflow-hidden px-2 py-2">
    <span
      v-if="isLoading"
      class="block text-2xs font-medium text-muted-foreground/80"
    >
      {{ t("colorPicker.loading") }}
    </span>

    <div
      v-if="designPalettes.length > 0 || semanticColorOptions.length > 0"
      class="grid grid-cols-2 gap-x-2 gap-y-0"
    >
      <div v-if="designPalettes.length > 0" class="min-w-0">
        <p :class="COLUMN_LABEL_CLASS">{{ t("colorPicker.palette") }}</p>
        <div class="flex flex-wrap gap-1">
          <Button
            v-for="palette in designPalettes"
            :key="palette.name"
            type="button"
            variant="color-swatch"
            :class="[SWATCH_BUTTON_CLASS, swatchButtonClass(isActivePaletteSwatch(palette.name))]"
            :style="{ backgroundColor: palette.baseColor }"
            :title="palette.label"
            :disabled="disabled"
            @mouseenter="
              emit('setActiveSwatch', { kind: 'palette', name: palette.name })
            "
            @focus="
              emit('setActiveSwatch', { kind: 'palette', name: palette.name })
            "
            @click="
              emit('selectColor', {
                tokenSourceKey: paletteTokenSourceKey(palette.name),
                fallbackColor: palette.baseColor,
                paletteName: palette.name,
              })
            "
          />
        </div>
      </div>

      <div v-if="semanticColorOptions.length > 0" class="min-w-0">
        <p :class="COLUMN_LABEL_CLASS">{{ t("colorPicker.semanticColors") }}</p>
        <div class="flex flex-wrap gap-1">
          <Button
            v-for="option in semanticColorOptions"
            :key="option.key"
            type="button"
            variant="color-swatch"
            :class="[SWATCH_BUTTON_CLASS, swatchButtonClass(isActiveSemanticSwatch(option.key))]"
            :style="{ backgroundColor: option.color }"
            :title="
              designSwatchTitle({
                tokenSourceKey: semanticTokenSourceKey(option.key),
                fallbackColor: option.color,
                semanticKey: option.key,
              })
            "
            :disabled="disabled"
            @mouseenter="
              emit('setActiveSwatch', { kind: 'semantic', key: option.key })
            "
            @focus="
              emit('setActiveSwatch', { kind: 'semantic', key: option.key })
            "
            @click="
              emit('selectColor', {
                tokenSourceKey: semanticTokenSourceKey(option.key),
                fallbackColor: option.color,
                semanticKey: option.key,
              })
            "
          />
        </div>
      </div>
    </div>

    <div v-if="activeShadeSource" class="space-y-1">
      <p class="text-center text-3xs font-medium text-muted-foreground">
        {{ activeShadeSource.label }}
      </p>

      <div
        class="flex min-w-0 w-full overflow-hidden rounded-sm border border-border"
      >
        <Button
          v-for="shade in COLOR_SHADES"
          :key="shade"
          type="button"
          variant="color-swatch"
          class="h-6! min-h-6! min-w-0! flex-1! rounded-none! border-0! border-l! border-solid! border-border! p-0! shadow-none! first:border-l-0! hover:brightness-110"
          :style="{
            backgroundColor: shadeHex(activeShadeSource.shades, shade),
          }"
          :title="designSwatchTitle(shadeSelectOptions(activeShadeSource, shade))"
          :disabled="disabled"
          @click="emit('selectColor', shadeSelectOptions(activeShadeSource, shade))"
        />
      </div>
    </div>
  </div>
</template>
