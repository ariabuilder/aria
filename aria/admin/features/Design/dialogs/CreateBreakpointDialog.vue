<script setup lang="ts">
import { computed } from "vue";
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
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  label: string;
  width: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "update:label": [value: string];
  "update:width": [value: string];
  create: [];
}>();

const { t } = useStudioI18n();

const isValid = computed(() => {
  const width = Number.parseInt(props.width, 10);
  return props.label.trim().length > 0 && Number.isFinite(width) && width >= 0;
});

function handleCreate(): void {
  if (!isValid.value || props.isSaving) return;
  emit("create");
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader class="gap-0">
        <DialogTitle>
          {{ t("design.breakpoints.create.title") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("design.breakpoints.create.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="breakpoint-label">
          {{ t("design.breakpoints.create.breakpointLabel") }}
        </Label>
        <Input
          id="breakpoint-label"
          :model-value="label"
          :placeholder="t('design.breakpoints.labelPlaceholderComma')"
          autoFocus
          :disabled="isSaving"
          @update:model-value="emit('update:label', String($event))"
          @keydown.enter="handleCreate"
        />
      </div>

      <div class="grid gap-2">
        <Label for="breakpoint-width">
          {{ t("design.breakpoints.create.viewportWidth") }}
        </Label>
        <div class="relative flex items-center">
          <Input
            id="breakpoint-width"
            :model-value="width"
            type="number"
            min="0"
            inputmode="numeric"
            :placeholder="t('design.breakpoints.widthPlaceholderComma')"
            class="pr-10"
            :disabled="isSaving"
            @update:model-value="emit('update:width', String($event))"
            @keydown.enter="handleCreate"
          />
          <span
            class="pointer-events-none absolute right-3 text-xs text-muted-foreground"
          >
            px
          </span>
        </div>
        <p class="m-0 text-xs leading-relaxed text-muted-foreground">
          {{ t("design.breakpoints.create.maxWidthHelper") }}
        </p>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          size="lg"
          :disabled="isSaving"
          @click="emit('update:open', false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="default"
          size="lg"
          :disabled="!isValid || isSaving"
          @click="handleCreate"
        >
          {{
            isSaving
              ? t("design.breakpoints.create.creating")
              : t("design.breakpoints.create.action")
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
