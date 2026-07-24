<script setup lang="ts">
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudioI18n } from "@/i18n";

const { t } = useStudioI18n();

const props = defineProps<{
  open: boolean;
  name: string;
  variableName: string;
  color: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:name": [value: string];
  "update:variableName": [value: string];
  "update:color": [value: string];
  submit: [];
}>();

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
}

function handleSubmit(): void {
  if (!props.name.trim() || props.isSaving) {
    return;
  }

  emit("submit");
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[525px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("design.colors.addDialog.title") }}</DialogTitle>
        <DialogDescription>
          {{ t("design.colors.addDialog.description") }}
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-2">
        <Label for="palette-name">{{ t("design.colors.addDialog.name") }}</Label>
        <Input
          id="palette-name"
          :model-value="name"
          :placeholder="t('design.colors.addDialog.namePlaceholder')"
          autoFocus
          @update:model-value="emit('update:name', String($event))"
          @keydown.enter="handleSubmit"
        />
      </div>
      <div class="grid gap-2">
        <Label for="palette-variable-name">{{ t("design.colors.addDialog.variableName") }}</Label>
        <Input
          id="palette-variable-name"
          :model-value="variableName"
          :placeholder="t('design.colors.addDialog.variablePlaceholder')"
          @update:model-value="emit('update:variableName', String($event))"
          @keydown.enter="handleSubmit"
        />
      </div>
      <div class="grid gap-4">
        <Label>{{ t("design.colors.addDialog.baseColor") }}</Label>
        <div class="flex items-center gap-4">
          <ColorPicker
            :model-value="color"
            show-alpha
            @update:model-value="emit('update:color', String($event))"
          >
            <Button
              type="button"
              variant="color-swatch"
              class="size-9 rounded-md border border-border"
              :style="{ backgroundColor: color }"
            />
          </ColorPicker>
          <div class="min-w-0">
            <p class="text-xs text-muted-foreground m-0 pb-1">
              {{ t("design.colors.addDialog.selectedColor") }}
            </p>
            <p class="font-mono text-sm text-foreground m-0">{{ color }}</p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="destructive" size="lg" @click="handleOpenChange(false)"
          >{{ t("common.cancel") }}</Button
        >
        <Button
          variant="default"
          :disabled="!name.trim() || isSaving"
          size="lg"
          @click="handleSubmit"
        >
          {{ isSaving ? t("design.colors.addDialog.adding") : t("design.colors.addPalette") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
