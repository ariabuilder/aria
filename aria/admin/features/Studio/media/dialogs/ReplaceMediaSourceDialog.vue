<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStudioI18n } from "@/i18n";

defineProps<{
  open: boolean;
  assetName?: string;
  fileName?: string;
  variantCount: number;
  isReplacing: boolean;
}>();
const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();
const { t } = useStudioI18n();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent>
      <DialogTitle class="text-xl font-serif font-normal text-foreground">
        {{ t("media.replace.title") }}
      </DialogTitle>
      <DialogDescription class="text-sm leading-relaxed text-muted-foreground">
        {{
          t("media.replace.description", {
            asset: assetName || t("media.delete.fallbackAsset"),
          })
        }}
      </DialogDescription>
      <div
        class="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5"
      >
        <p class="truncate text-sm font-medium text-foreground">
          {{ fileName }}
        </p>
        <p
          v-if="variantCount > 0"
          class="mt-1 text-xs leading-5 text-muted-foreground"
        >
          {{ t("media.replace.variantsPreserved", { count: variantCount }) }}
        </p>
      </div>
      <DialogFooter class="px-4 pb-4 pt-3 gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          :disabled="isReplacing"
          @click="emit('cancel')"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button size="sm" :disabled="isReplacing" @click="emit('confirm')">
          {{
            isReplacing
              ? t("media.replace.replacing")
              : t("media.replace.confirm")
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
