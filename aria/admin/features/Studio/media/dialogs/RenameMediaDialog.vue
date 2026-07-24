<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  modelValue: string;
  extension?: string;
  assetName?: string;
  referenceCount?: number | null;
  isRenaming: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:modelValue": [value: string];
  confirm: [];
  cancel: [];
}>();

const filename = computed({
  get: () => props.modelValue,
  set: (value: string) => emit("update:modelValue", value),
});
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="sm:max-w-[440px] p-0 gap-0 overflow-hidden bg-background border border-dashed border-border [&>button]:top-3 [&>button]:right-3 [&>button]:text-muted-foreground [&>button]:opacity-90 [&>button]:hover:opacity-100"
    >
      <div class="px-4 pt-4">
        <h2 class="text-xl font-serif font-normal text-foreground leading-0">
          Rename Media
        </h2>
        <p v-if="assetName" class="mt-2 text-xs text-muted-foreground">
          {{ assetName }}
        </p>
        <p
          v-if="referenceCount && referenceCount > 0"
          class="mt-2 text-xs text-muted-foreground"
        >
          All references will be updated to the new filename.
        </p>
      </div>

      <div class="px-4 py-3">
        <div class="flex items-center gap-2">
          <Input
            v-model="filename"
            placeholder="New filename"
            class="h-10 text-base"
            @keydown.enter="$emit('confirm')"
          />
          <span
            v-if="extension"
            class="h-10 inline-flex items-center rounded-sm border border-dashed border-border bg-muted/20 px-3 text-xs text-muted-foreground font-mono shrink-0"
          >
            {{ extension }}
          </span>
        </div>
      </div>

      <DialogFooter class="px-4 pb-4 pt-3 gap-2 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          :disabled="isRenaming"
          @click="$emit('cancel')"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="default"
          :disabled="isRenaming"
          @click="$emit('confirm')"
        >
          {{ isRenaming ? "Renaming..." : "Rename" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
