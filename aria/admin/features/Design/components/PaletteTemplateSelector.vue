<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStudioI18n } from "@/i18n";
import { studioIcons } from "@/lib/icons";
import type { PaletteTemplate } from "../../../../lib/design/types";

defineProps<{
  templates: PaletteTemplate[];
  isApplying: boolean;
  getPreviewRows: (template: PaletteTemplate) => string[][];
}>();

const emit = defineEmits<{
  apply: [template: PaletteTemplate];
}>();

const { t } = useStudioI18n();
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="secondary"
        size="md"
        :disabled="isApplying"
        :aria-label="t('design.colors.applyDialog.applyTemplate')"
      >
        <span :class="[studioIcons.design, 'size-3.5 shrink-0']" />
        <span>
          {{
            isApplying
              ? t("design.colors.applying")
              : t("design.colors.applyDialog.applyTemplate")
          }}
        </span>
        <span
          :class="[studioIcons.chevronDown, 'ml-1 size-3.5 shrink-0 text-muted-foreground']"
          aria-hidden="true"
        />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="end"
      class="w-78 p-1"
      :aria-label="t('design.colors.templates')"
    >
      <DropdownMenuItem
        v-for="template in templates"
        :key="template.id"
        class="group min-h-12 gap-3 rounded-sm border-b-0 px-2.5 py-2"
        :disabled="isApplying"
        :aria-label="
          t('design.colors.applyPaletteAria', { name: template.name })
        "
        :title="template.description"
        @select="emit('apply', template)"
      >
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {{ template.name }}
        </span>

        <span
          class="grid w-24 shrink-0 gap-px overflow-hidden rounded-[3px] border border-solid border-black/5 dark:border-white/8"
          aria-hidden="true"
        >
          <span
            v-for="(row, rowIndex) in getPreviewRows(template)"
            :key="rowIndex"
            class="flex h-1.5"
          >
            <span
              v-for="(color, colorIndex) in row"
              :key="colorIndex"
              class="min-w-0 flex-1"
              :style="{ backgroundColor: color }"
            />
          </span>
        </span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
