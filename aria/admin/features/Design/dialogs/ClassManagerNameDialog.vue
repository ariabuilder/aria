<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { z } from "zod";

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
import { useVariableReferenceOptions } from "@/composables/useVariableReferenceOptions";
import { useStudioI18n } from "@/i18n";
import BreakpointSelector from "../components/BreakpointSelector.vue";
import CssEditor from "../components/CssEditor.vue";
import { CSS_CLASS_NAME_REGEX } from "../../../../lib/schemas/classEditor";

interface BreakpointOption {
  id: string;
  label: string;
  icon?: string;
}

type ClassManagerNameDialogMode = "create" | "rename" | "duplicate";

const { t } = useStudioI18n();
const { variableReferenceOptions } = useVariableReferenceOptions();

const props = defineProps<{
  open: boolean;
  mode: ClassManagerNameDialogMode;
  breakpoints: BreakpointOption[];
  initialName?: string;
  initialCss?: string;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  submit: [payload: { name: string; cssText?: string; breakpoint?: string }];
}>();

const nameDraft = ref("");
const cssDraft = ref("");
const selectedBreakpoint = ref("base");

const ClassNameSchema = z
  .string()
  .trim()
  .min(1, "Class name is required")
  .max(64, "Class names must be 64 characters or fewer")
  .regex(CSS_CLASS_NAME_REGEX, "Use letters, numbers, hyphens, or underscores");

const title = computed(() => {
  if (props.mode === "create") {
    return t("design.classes.nameDialog.createTitle");
  }

  if (props.mode === "rename") {
    return t("design.classes.nameDialog.renameTitle");
  }

  return t("design.classes.nameDialog.duplicateTitle");
});

const description = computed(() => {
  if (props.mode === "create") {
    return t("design.classes.nameDialog.createDescription");
  }

  if (props.mode === "rename") {
    return t("design.classes.nameDialog.renameDescription");
  }

  return t("design.classes.nameDialog.duplicateDescription");
});

const submitLabel = computed(() => {
  if (props.mode === "create") {
    return t("design.classes.nameDialog.createSubmit");
  }

  if (props.mode === "rename") {
    return t("design.classes.nameDialog.renameSubmit");
  }

  return t("design.classes.nameDialog.duplicateSubmit");
});

const canSubmit = computed(
  () => ClassNameSchema.safeParse(nameDraft.value).success,
);

function handleOpenChange(value: boolean): void {
  emit("update:open", value);
}

function handleSubmit(): void {
  const parsedName = ClassNameSchema.safeParse(nameDraft.value);
  if (!parsedName.success) {
    return;
  }

  emit("submit", {
    name: parsedName.data,
    cssText: props.mode !== "rename" ? cssDraft.value : undefined,
    breakpoint: props.mode !== "rename" ? selectedBreakpoint.value : undefined,
  });
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }

    nameDraft.value = props.mode === "rename" ? (props.initialName ?? "") : "";
    cssDraft.value = props.initialCss ?? "";
    selectedBreakpoint.value = "base";
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[525px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="class-name">{{
          t("design.classes.nameDialog.nameLabel")
        }}</Label>
        <Input
          id="class-name"
          v-model="nameDraft"
          placeholder="hero-heading"
          autofocus
          @keydown.enter="handleSubmit"
        />
        <p class="text-xs text-muted-foreground/80">
          {{ t("design.classes.nameDialog.nameHint") }}
        </p>
      </div>

      <div v-if="mode === 'create'" class="grid gap-2">
        <Label>{{ t("design.classes.nameDialog.breakpointLabel") }}</Label>
        <BreakpointSelector
          v-model="selectedBreakpoint"
          :breakpoints="breakpoints"
        />
      </div>

      <div v-if="mode === 'create'" class="grid gap-2">
        <Label for="class-css">{{
          t("design.classes.nameDialog.cssLabel")
        }}</Label>
        <CssEditor
          v-model="cssDraft"
          :line-numbers="false"
          :variable-references="variableReferenceOptions"
          placeholder="font-size: 3rem;&#10;font-weight: 700;"
        />
        <p class="text-2xs text-muted-foreground/80 font-mono">
          {{ t("design.classes.nameDialog.cssHint") }}
        </p>
      </div>

      <DialogFooter>
        <Button
          variant="destructive"
          size="default"
          @click="handleOpenChange(false)"
          >{{ t("common.cancel") }}</Button
        >
        <Button
          variant="default"
          size="default"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          {{ submitLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
