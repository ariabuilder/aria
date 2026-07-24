<script setup lang="ts">
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const props = defineProps<{
  checked?: boolean | "indeterminate";
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:checked": [value: boolean];
}>();

function handleUpdate(val: boolean | "indeterminate") {
  if (typeof val === "boolean") {
    emit("update:checked", val);
  }
}
</script>

<template>
  <Label
    class="relative flex w-full h-full items-center justify-center cursor-pointer"
    @click.stop
  >
    <Checkbox
      :model-value="props.checked"
      :disabled="disabled"
      @update:model-value="handleUpdate"
    />
  </Label>
</template>
