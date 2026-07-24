<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStudioI18n } from "@/i18n";
import type { GlobalStyleVariables } from "../../../../lib/styles/universalDesignSystem";
import {
  parseVariableImportInput,
  VariableImportModeSchema,
  type VariableImportMode,
} from "../lib/variableManagerImport";

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [
    payload: { mode: VariableImportMode; variables: GlobalStyleVariables },
  ];
}>();

const importDraft = ref("");
const importMode = ref<VariableImportMode>("merge");
const { t } = useStudioI18n();

const importModeOptions = computed(() => [
  { value: "merge" as const, label: t("design.variables.importDialog.mode.merge") },
  { value: "replace" as const, label: t("design.variables.importDialog.mode.replace") },
]);

const importPreview = computed(() =>
  parseVariableImportInput(importDraft.value),
);
const canSubmitImport = computed(
  () =>
    importPreview.value.success && importPreview.value.summary.totalCount > 0,
);

function resetState(): void {
  importDraft.value = "";
  importMode.value = "merge";
}

function setImportMode(value: string): void {
  const parsedImportMode = VariableImportModeSchema.safeParse(value);
  if (!parsedImportMode.success) {
    return;
  }

  importMode.value = parsedImportMode.data;
}

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
}

function handleSubmit(): void {
  if (!importPreview.value.success) {
    toast.error(importPreview.value.error);
    return;
  }

  emit("submit", {
    mode: importMode.value,
    variables: importPreview.value.data,
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetState();
    }
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="sm:max-w-[720px] border border-solid border-border bg-card/50! p-4"
    >
      <DialogHeader class="space-y-2">
        <DialogTitle class="text-2xl font-serif font-medium text-foreground">
          {{ t("design.variables.importDialog.title") }}
        </DialogTitle>
        <DialogDescription
          class="text-xs leading-relaxed text-muted-foreground"
        >
          {{ t("design.variables.importDialog.description") }}
        </DialogDescription>
      </DialogHeader>

      <Textarea
        v-model="importDraft"
        rows="6"
        class="min-h-40 w-full font-mono text-xs"
        :placeholder="t('design.variables.importDialog.placeholder')"
      />

      <DialogFooter
        class="flex-col gap-3 pt-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="w-full sm:w-56">
          <p
            class="mb-2 text-2xs uppercase tracking-[0.16em] text-muted-foreground"
          >
            {{ t("design.variables.importDialog.modeLabel") }}
          </p>
          <Select
            :model-value="importMode"
            @update:model-value="setImportMode(String($event))"
          >
            <SelectTrigger class="h-9 border-border bg-card/50 text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in importModeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" @click="handleOpenChange(false)">
            {{ t("common.cancel") }}
          </Button>
          <Button
            size="sm"
            variant="default"
            :disabled="!canSubmitImport"
            @click="handleSubmit"
          >
            {{ t("design.variables.importDialog.submit") }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
