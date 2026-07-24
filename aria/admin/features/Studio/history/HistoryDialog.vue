<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import {
  Dialog,
  DialogScrollContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useHistoryDialog } from "./composables/useHistoryDialog";
import { HistoryPanel } from "@/features/History";

const dialog = useHistoryDialog();
const isMobile = useMediaQuery("(max-width: 767px)");
</script>

<template>
  <!-- Desktop: Dialog overlay -->
  <Dialog
    v-if="!isMobile"
    :open="dialog.isOpen.value"
    @update:open="dialog.isOpen.value = $event"
  >
    <DialogScrollContent
      lock-overlay-scroll
      class="!max-w-lg !w-full max-h-[80vh] !p-0 !gap-0 !rounded-lg overflow-hidden"
    >
      <!-- Accessible title/description for screen readers -->
      <DialogTitle class="sr-only">History</DialogTitle>
      <DialogDescription class="sr-only"
        >View page revision history</DialogDescription
      >
      <HistoryPanel max-height="calc(80vh - 2rem)" />
    </DialogScrollContent>
  </Dialog>

  <!-- Mobile: Sheet drawer -->
  <Sheet
    v-else
    :open="dialog.isOpen.value"
    @update:open="dialog.isOpen.value = $event"
  >
    <SheetContent side="right" class="w-full sm:max-w-full p-0">
      <HistoryPanel max-height="calc(100vh - 4rem)" show-header />
    </SheetContent>
  </Sheet>
</template>
