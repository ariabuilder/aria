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

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    busy?: boolean;
    destructive?: boolean;
  }>(),
  { busy: false, destructive: false },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [];
}>();
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle class="m-0">{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <DialogFooter class="gap-2 sm:justify-end">
        <Button
          variant="outline"
          :disabled="busy"
          @click="emit('update:open', false)"
          >Cancel</Button
        >
        <Button
          :variant="destructive ? 'destructive' : 'default'"
          :disabled="busy"
          @click="emit('confirm')"
          >{{ confirmLabel }}</Button
        >
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
