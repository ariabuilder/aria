<script setup lang="ts">
import { computed } from "vue";

import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import {
  COLOR_SHADES,
  type ColorPaletteShades,
  type ColorShade,
} from "../../../../lib/design/types";

interface PaletteRowModel {
  name: string;
  label: string;
  shades: ColorPaletteShades;
}

const props = defineProps<{
  palette: PaletteRowModel;
  copiedSwatch: string | null;
  renamingLabel: boolean;
  renameValue: string;
  renamingVariable: boolean;
  renameVariableValue: string;
  getTextColorForBackground: (color: string) => string;
}>();

const emit = defineEmits<{
  updateBaseColor: [color: string];
  startRenameLabel: [];
  updateRenameValue: [value: string];
  commitRenameLabel: [];
  cancelRenameLabel: [];
  startRenameVariable: [];
  updateRenameVariableValue: [value: string];
  commitRenameVariable: [];
  cancelRenameVariable: [];
  delete: [];
  copy: [hex: string, id: string, announcement: string];
}>();

const { t } = useStudioI18n();

const baseColor = computed(
  () => props.palette.shades.DEFAULT || props.palette.shades[500],
);

function shadeHex(shade: ColorShade): string {
  return props.palette.shades[shade] ?? baseColor.value;
}

function copyShade(shade: ColorShade): void {
  const hex = shadeHex(shade);
  emit(
    "copy",
    hex,
    `${props.palette.name}-${shade}`,
    t("design.colors.copyAnnouncement", {
      name: props.palette.label,
      shade,
      hex,
    }),
  );
}
</script>

<template>
  <article class="palette-scale-row group/row">
    <div class="palette-scale-meta">
      <ColorPicker
        :model-value="baseColor"
        show-alpha
        @update:model-value="emit('updateBaseColor', $event)"
      >
        <Button
          type="button"
          variant="color-swatch"
          class="h-8! w-12! shrink-0 overflow-hidden rounded-sm! border-solid shadow-none"
          :style="{ backgroundColor: baseColor }"
          :aria-label="
            t('design.colors.pickBaseColor', { name: palette.label })
          "
        />
      </ColorPicker>

      <div class="flex min-w-0 flex-1 items-center gap-3">
        <span
          v-if="!renamingLabel"
          class="max-w-[45%] truncate font-serif text-base font-medium text-foreground"
        >
          {{ palette.label }}
        </span>
        <input
          v-else
          :id="`rename-${palette.name}`"
          :value="renameValue"
          class="block h-6 w-36 max-w-[45%] border-0 border-b border-dashed border-primary bg-transparent p-0 font-serif text-base text-foreground outline-none"
          @input="
            emit(
              'updateRenameValue',
              ($event.target as HTMLInputElement).value,
            )
          "
          @blur="emit('commitRenameLabel')"
          @keydown.enter="emit('commitRenameLabel')"
          @keydown.escape="emit('cancelRenameLabel')"
        />

        <span
          v-if="!renamingVariable"
          class="mt-0.5 min-w-0 truncate font-mono text-2xs text-primary/80"
        >
          --{{ palette.name }}
        </span>
        <input
          v-else
          :id="`var-rename-${palette.name}`"
          :value="renameVariableValue"
          class="block h-5 min-w-0 max-w-52 border-0 border-b border-dashed border-primary bg-transparent p-0 font-mono text-2xs text-foreground outline-none"
          @input="
            emit(
              'updateRenameVariableValue',
              ($event.target as HTMLInputElement).value,
            )
          "
          @blur="emit('commitRenameVariable')"
          @keydown.enter="emit('commitRenameVariable')"
          @keydown.escape="emit('cancelRenameVariable')"
        />
      </div>

      <span
        class="ml-auto shrink-0 font-mono text-2xs uppercase text-muted-foreground"
      >
        {{ baseColor }}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            class="-mr-1 text-muted-foreground opacity-70 hover:text-foreground group-hover/row:opacity-100"
            :aria-label="
              t('design.colors.paletteActions', { name: palette.label })
            "
          >
            <span :class="[studioIcons.moreHorizontal, 'size-3.5']" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem @select="emit('startRenameLabel')">
            <span :class="[studioIcons.edit, 'size-3.5']" />
            {{ t("design.colors.renamePaletteAction") }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="emit('startRenameVariable')">
            <span :class="[studioIcons.variable, 'size-3.5']" />
            {{ t("design.colors.renameVariableAction") }}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" @select="emit('delete')">
            <span :class="[studioIcons.trash, 'size-3.5']" />
            {{ t("design.colors.deletePaletteAction") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="palette-shade-scroll">
      <div class="palette-shade-grid">
        <button
          v-for="shade in COLOR_SHADES"
          :key="shade"
          type="button"
          class="palette-shade group/swatch"
          :aria-label="
            t('design.colors.copyShadeAria', {
              name: palette.label,
              shade,
              hex: shadeHex(shade),
            })
          "
          data-testid="palette-swatch"
          @click="copyShade(shade)"
        >
          <span
            class="relative block h-9 w-full"
            :style="{ backgroundColor: shadeHex(shade) }"
            aria-hidden="true"
          >
            <span
              v-if="copiedSwatch === `${palette.name}-${shade}`"
              class="absolute inset-0 grid place-items-center"
            >
              <span
                :class="[studioIcons.checkCircleLinear, 'size-4']"
                :style="{ color: getTextColorForBackground(shadeHex(shade)) }"
              />
            </span>
          </span>
          <span class="block px-1 py-1.5 text-left">
            <span class="block text-2xs font-medium leading-3 text-foreground">
              {{ shade }}
            </span>
            <span
              class="mt-0.5 block truncate font-mono text-[9px] uppercase leading-3 text-muted-foreground"
            >
              {{ shadeHex(shade) }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.palette-scale-row {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--card) 18%, transparent);
  padding: 0.875rem;
}

.palette-scale-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.palette-shade-scroll {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.palette-shade-grid {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 0.25rem;
}

.palette-shade {
  min-width: 0;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 0.25rem;
  background: transparent;
  padding: 0;
  text-align: left;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    transform 120ms ease;
}

.palette-shade:hover {
  position: relative;
  z-index: 1;
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 5%, transparent);
}

.palette-shade:focus-visible {
  position: relative;
  z-index: 2;
  border-color: var(--primary);
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  .palette-shade {
    transition: none;
  }
}
</style>
