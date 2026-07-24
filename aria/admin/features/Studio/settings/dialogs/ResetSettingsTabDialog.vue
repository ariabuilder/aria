<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const { t } = useStudioI18n();

defineProps<{
  open: boolean;
  title: string;
  description: string;
  warning: string;
  items?: readonly string[];
  isConfirming?: boolean;
  confirmLabel?: string;
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
      class="sm:max-w-lg gap-0 overflow-hidden p-0 [&>button]:top-4 [&>button]:right-5"
    >
      <DialogHeader class="px-6 pt-6 pb-4">
        <DialogTitle class="m-0 font-serif text-xl font-medium text-foreground">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="m-0 mt-1.5 text-sm text-muted-foreground">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div
        class="mx-6 rounded-sm border border-solid border-destructive/20 bg-destructive/10 px-4 py-3"
      >
        <p class="text-sm leading-relaxed text-foreground/90">
          {{ warning }}
        </p>

        <ul v-if="items?.length" class="mt-4 space-y-2">
          <li
            v-for="item in items"
            :key="item"
            class="flex gap-3 text-sm leading-relaxed text-muted-foreground/80"
          >
            <span
              class="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/80"
              aria-hidden="true"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <DialogFooter class="flex items-center justify-between px-6 py-4">
        <Button
          variant="outline"
          class="h-9!"
          size="sm"
          :disabled="isConfirming"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          class="h-9!"
          size="sm"
          :disabled="isConfirming"
          @click="handleConfirm"
        >
          {{ isConfirming ? t("settings.resetting") : (confirmLabel ?? t("common.resetToDefaults")) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
