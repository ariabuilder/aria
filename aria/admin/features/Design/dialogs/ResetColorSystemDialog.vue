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

defineProps<{
  open: boolean;
  isConfirming?: boolean;
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
      <DialogHeader class="px-6 pt-5 pb-4 border-b border-border">
        <DialogTitle class="text-xl font-serif font-medium text-foreground">
          Reset Color System
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground mt-1.5">
          This will restore all colors to their factory defaults.
        </DialogDescription>
      </DialogHeader>

      <div class="px-6 py-5 bg-sidebar/10">
        <p class="text-sm leading-relaxed text-foreground/90">
          All custom palettes, swatches, and color assignments will be replaced
          with the default Aria color system. Any colors you've referenced in
          your global styles or components will revert to their original values.
        </p>
        <p class="text-sm leading-relaxed text-muted-foreground mt-3">
          A history entry will be recorded so you can undo this reset if needed.
        </p>
      </div>

      <DialogFooter
        class="px-6 py-4 border-t border-border flex items-center justify-between"
      >
        <Button
          variant="outline"
          :disabled="isConfirming"
          @click="handleOpenChange(false)"
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          :disabled="isConfirming"
          @click="handleConfirm"
        >
          {{ isConfirming ? "Resetting…" : "Reset Colors" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
