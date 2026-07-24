<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useVariableReferenceOptions } from "@/composables/useVariableReferenceOptions";
import { useStudioI18n } from "@/i18n";
import BreakpointSelector from "./BreakpointSelector.vue";
import CssEditor from "./CssEditor.vue";

const { t } = useStudioI18n();
const { variableReferenceOptions } = useVariableReferenceOptions();

interface BreakpointOption {
  id: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  open: boolean;
  className: string;
  selectorPreview: string;
  breakpoints: BreakpointOption[];
  initialCss: string;
  initialBreakpoint: string;
  isSaving?: boolean;
  readOnly?: boolean;
  errorMessage?: string | null;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [payload: { cssText: string; breakpoint: string }];
}>();

const cssDraft = ref("");
const selectedBreakpoint = ref("base");
const isDiscardConfirmationOpen = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedBreakpoint.value = props.initialBreakpoint;
      cssDraft.value = props.initialCss;
    } else {
      isDiscardConfirmationOpen.value = false;
    }
  },
);

const isDirty = computed(
  () =>
    cssDraft.value !== props.initialCss ||
    selectedBreakpoint.value !== props.initialBreakpoint,
);

const description = computed(() => {
  const current = props.breakpoints.find(
    (bp) => bp.id === selectedBreakpoint.value,
  );
  const breakpointLabel = current?.label ?? selectedBreakpoint.value;
  return t("design.classes.cssDialog.description", {
    selector: props.selectorPreview,
    breakpoint: breakpointLabel,
  });
});

function handleOpenChange(value: boolean): void {
  if (!value && isDirty.value) {
    isDiscardConfirmationOpen.value = true;
    return;
  }

  emit("update:open", value);
}

function handleDiscardConfirmationOpenChange(value: boolean): void {
  isDiscardConfirmationOpen.value = value;
}

function handleDiscard(): void {
  isDiscardConfirmationOpen.value = false;
  emit("update:open", false);
}

function handleSubmit(): void {
  emit("submit", {
    cssText: cssDraft.value,
    breakpoint: selectedBreakpoint.value,
  });
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[560px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("design.classes.cssDialog.title") }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label>{{ t("design.classes.cssDialog.breakpointLabel") }}</Label>
        <BreakpointSelector
          v-model="selectedBreakpoint"
          :breakpoints="breakpoints"
          :disabled="readOnly"
        />
      </div>

      <div class="grid gap-2">
        <Label for="class-css-declarations">{{
          t("design.classes.cssDialog.declarationsLabel")
        }}</Label>
        <div class="min-h-[320px]">
          <CssEditor
            v-if="open"
            v-model="cssDraft"
            :line-numbers="false"
            :variable-references="variableReferenceOptions"
            placeholder="font-size: 3rem;&#10;font-weight: 700;"
          />
        </div>
        <p
          v-if="errorMessage"
          class="text-2xs font-mono text-destructive"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <p v-else class="text-2xs text-muted-foreground/80 font-mono">
          {{ t("design.classes.cssDialog.declarationsHint") }}
        </p>
      </div>

      <DialogFooter>
        <Button
          variant="destructive"
          size="default"
          @click="handleOpenChange(false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="secondary"
          size="default"
          :disabled="isSaving || readOnly"
          @click="handleSubmit"
        >
          {{ t("design.classes.cssDialog.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog
    :open="isDiscardConfirmationOpen"
    @update:open="handleDiscardConfirmationOpenChange"
  >
    <DialogContent :show-close-button="false" class="sm:max-w-[425px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("design.classes.cssDialog.discardTitle") }}</DialogTitle>
        <DialogDescription>
          {{ t("design.classes.cssDialog.discardConfirmation") }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="outline" @click="isDiscardConfirmationOpen = false">
          {{ t("common.cancel") }}
        </Button>
        <Button variant="destructive" @click="handleDiscard">
          {{ t("design.classes.cssDialog.discard") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
