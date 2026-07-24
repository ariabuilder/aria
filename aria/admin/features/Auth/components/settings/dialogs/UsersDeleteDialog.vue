<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { User } from "@/lib/auth/types";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  user: User | null;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
const { t } = useStudioI18n();
</script>

<template>
  <Dialog v-model:open="openModel">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-destructive">
          <span
            class="i-hugeicons:delete-02 size-[18px]"
          />
          {{ t("users.deleteTitle") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("users.deleteDescription", { username: user?.username ?? "" }) }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter class="gap-2 sm:gap-0">
        <Button variant="outline" @click="openModel = false">{{ t("common.cancel") }}</Button>
        <Button
          variant="destructive"
          @click="emit('confirm')"
          :disabled="loading || !canDelete"
          class="gap-2"
        >
          <span
            v-if="loading"
            class="i-hugeicons:refresh size-3.5 animate-spin"
          />
          {{ t("users.deleteTitle") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
