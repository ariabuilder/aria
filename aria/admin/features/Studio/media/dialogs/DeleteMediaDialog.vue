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

interface Props {
  open: boolean;
  assetName?: string;
  deleteCount?: number;
  isDeleting: boolean;
}

const { open, assetName, deleteCount, isDeleting } = defineProps<Props>();
const { t } = useStudioI18n();

defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class=""
    >
      <div class="">
        <DialogTitle class="text-xl font-serif font-normal text-foreground leading-0">
          {{ t("media.delete.title") }}
        </DialogTitle>
        <DialogDescription class="mt-3 text-sm text-muted-foreground text-balance leading-relaxed">
          <template v-if="deleteCount && deleteCount > 1">
            {{ t("media.delete.manyDescription", { count: deleteCount }) }}
          </template>
          <template v-else>
            {{ t("media.delete.oneDescription", { asset: assetName || t("media.delete.fallbackAsset") }) }}
          </template>
        </DialogDescription>
      </div>

      <DialogFooter class="px-4 pb-4 pt-4 gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          class="h-9!"
          :disabled="isDeleting"
          @click="$emit('cancel')"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="h-9!"
          :disabled="isDeleting"
          @click="$emit('confirm')"
        >
          {{ isDeleting ? t("common.deleting") : t("common.delete") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
