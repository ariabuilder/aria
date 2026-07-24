<script setup lang="ts">
import { ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const props = withDefaults(
  defineProps<{
    open: boolean;
    pending?: boolean;
  }>(),
  {
    pending: false,
  },
);

const emit = defineEmits<{
  "update:open": [value: boolean];
  create: [payload: { name: string }];
}>();

const name = ref("");

function resetForm(): void {
  name.value = "";
}

function handleCreate(): void {
  const trimmedName = name.value.trim();
  if (!trimmedName || props.pending) return;
  emit("create", { name: trimmedName });
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) resetForm();
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>New layout</DialogTitle>
        <DialogDescription>
          Create a reusable layout template for your pages.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-2 py-2">
        <Label for="layout-name">Name</Label>
        <Input
          id="layout-name"
          v-model="name"
          placeholder="Marketing layout"
          @keydown.enter.prevent="handleCreate"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          Cancel
        </Button>
        <Button :disabled="!name.trim() || pending" @click="handleCreate">
          {{ pending ? "Creating…" : "Create layout" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
