<script setup lang="ts">
import { nextTick, ref } from "vue";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { studioIcons } from "@/lib/icons";

const NameSchema = z.string().trim().min(1);

const props = withDefaults(
  defineProps<{
    label: string;
    placeholder: string;
    hint: string;
    icon?: string;
    disabled?: boolean;
  }>(),
  { icon: studioIcons.folderAdd, disabled: false },
);

const emit = defineEmits<{ create: [name: string] }>();

const isCreating = ref(false);
const value = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

function startCreate(): void {
  if (props.disabled) return;
  isCreating.value = true;
  value.value = "";
  void nextTick(() => inputRef.value?.focus());
}

function cancelCreate(): void {
  isCreating.value = false;
  value.value = "";
}

function submitCreate(): void {
  const parsed = NameSchema.safeParse(value.value.trim());
  if (parsed.success) emit("create", parsed.data);
  cancelCreate();
}

defineExpose({ startCreate });
</script>

<template>
  <div
    v-if="isCreating"
    class="border-b border-dashed border-border/50 px-6 py-3"
  >
    <input
      ref="inputRef"
      v-model="value"
      type="text"
      :placeholder="placeholder"
      class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
      @keydown.enter.prevent="submitCreate"
      @keydown.esc.prevent="cancelCreate"
      @blur="submitCreate"
    />
    <p class="mt-1 text-2xs text-muted-foreground/50">{{ hint }}</p>
  </div>

  <div class="border-b border-dashed border-border/50 px-3 py-2">
    <Button
      variant="ghost"
      size="sm"
      class="w-full justify-start gap-2 px-3 text-muted-foreground"
      :disabled="disabled"
      @click="startCreate"
    >
      <span :class="[icon, 'size-4']" />
      {{ label }}
    </Button>
  </div>
</template>
