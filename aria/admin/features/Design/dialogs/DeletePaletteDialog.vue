<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();

defineProps<{
  open: boolean;
  paletteLabel?: string;
  paletteName?: string;
  isDeleting?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
}

function handleConfirm(): void {
  emit("confirm");
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="sm:max-w-lg p-0 gap-0 overflow-hidden [&>button]:top-4 [&>button]:right-5"
    >
      <DialogHeader class="gap-0">
        <DialogTitle class="text-xl font-serif font-medium text-foreground m-0">
          {{ t("design.colors.deleteDialog.title") }}
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground mt-1.5 m-0">
          {{ t("design.colors.deleteDialog.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-0">
        <p class="text-sm leading-relaxed text-foreground/90 text-balance">
          {{ t("design.colors.deleteDialog.willDelete") }}
          <span class="font-semibold text-foreground">
            {{ paletteLabel || paletteName || t("design.colors.deleteDialog.thisPalette") }}
          </span>
          {{ t("design.colors.deleteDialog.removeFromList") }}
        </p>
        <p
          v-if="paletteName"
          class="mt-3 rounded-md border border-border/60 px-3 py-2 font-mono text-xs text-muted-foreground"
        >
          --{{ paletteName }}
        </p>
        <p class="text-sm leading-relaxed text-muted-foreground mt-5 text-balance">
          {{ t("design.colors.deleteDialog.referencesPreserved") }}
        </p>
      </div>

      <DialogFooter
        class="py-4 flex items-center justify-between"
      >
        <Button
          variant="outline"
          class="h-9!"
          size="sm"
          :disabled="isDeleting"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          class="h-9!"
          size="sm"
          :disabled="isDeleting"
          @click="handleConfirm"
        >
          {{ isDeleting ? t("common.deleting") : t("design.colors.deleteDialog.deletePalette") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
