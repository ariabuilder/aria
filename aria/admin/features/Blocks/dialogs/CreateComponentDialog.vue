<script setup lang="ts">

import { ref, watch, computed } from "vue";

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
import { studioIcons } from "@/lib/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { slugify } from "../../../../lib/utils/slugify";
import { useStudioI18n } from "@/i18n";

const COPY_SUFFIX = "Copy";
const NEW_GROUP_VALUE = "__new__";

const props = defineProps<{
  open: boolean;
  mode?: "create" | "convert";
  title?: string;
  description?: string;
  suggestedName?: string;
  groups?: readonly {
    id: string;
    name: string;
  }[];
  selectedGroupId?: string | null;
  confirmLabel?: string;
  allowNewGroup?: boolean;
  existingComponents: readonly {
    slug: string;
    name?: string;
    title?: string;
  }[];
}>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [
    payload: {
      name: string;
      groupId: string | null;
      newGroupName?: string;
    },
  ];
}>();

const componentName = ref("");
const selectedGroupId = ref<string | null>(null);
const newGroupName = ref("");

/**
 * Checks if a component name conflicts with existing components.
 * Compares both slugified versions and case-insensitive names.
 */
const isNameConflict = (candidateName: string): boolean => {
  const candidateSlug = slugify(candidateName);
  const normalizedCandidate = candidateName.toLowerCase();

  return props.existingComponents.some(
    (component) =>
      component.slug === candidateSlug ||
      (component.name || component.title || "").toLowerCase() ===
        normalizedCandidate,
  );
};

/**
 * Generates a unique component name by appending "Copy", "Copy 2", etc.
 * until no naming conflict exists.
 *
 * @param baseName - The original component name to make unique
 * @returns A unique component name with appropriate suffix
 */
const generateUniqueComponentName = (baseName: string): string => {
  let candidateName = baseName;
  let copyCounter = 1;

  while (isNameConflict(candidateName)) {
    candidateName =
      copyCounter === 1
        ? `${baseName} ${COPY_SUFFIX}`
        : `${baseName} ${COPY_SUFFIX} ${copyCounter}`;
    copyCounter++;
  }

  return candidateName;
};

/**
 * Resets the dialog state and closes it.
 */
const resetAndClose = (): void => {
  componentName.value = "";
  selectedGroupId.value = null;
  newGroupName.value = "";
  emit("update:open", false);
};

const isCreatingNewGroup = computed(
  () => selectedGroupId.value === NEW_GROUP_VALUE,
);

const hasDuplicateGroupName = computed(() => {
  const trimmed = newGroupName.value.trim();
  if (!trimmed || !isCreatingNewGroup.value) return false;

  return (props.groups ?? []).some(
    (group) => group.name.toLowerCase() === trimmed.toLowerCase(),
  );
});

/**
 * Validates if current name conflicts with existing components.
 */
const hasNameConflict = computed(() => {
  if (!componentName.value.trim()) return false;
  return isNameConflict(componentName.value);
});

/**
 * Generates slug preview for the current component name.
 */
const slugPreview = computed(() => {
  return componentName.value ? slugify(componentName.value) : "...";
});

/**
 * Determines if the confirm button should be disabled.
 */
const isConfirmDisabled = computed(() => {
  if (!componentName.value.trim() || hasNameConflict.value) {
    return true;
  }

  if (!props.groups?.length) {
    return false;
  }

  if (isCreatingNewGroup.value) {
    return !newGroupName.value.trim() || hasDuplicateGroupName.value;
  }

  return !selectedGroupId.value;
});

/**
 * Dialog title with fallback to mode-based defaults.
 */
const dialogTitle = computed(() => {
  return (
    props.title ||
    (props.mode === "convert"
      ? t("components.dialog.convertTitle")
      : t("components.dialog.createTitle"))
  );
});

/**
 * Dialog description with fallback to mode-based defaults.
 */
const dialogDescription = computed(() => {
  return (
    props.description ||
    (props.mode === "convert"
      ? t("components.dialog.convertDescription")
      : t("components.dialog.createDescription"))
  );
});

const confirmButtonLabel = computed(() => {
  if (props.confirmLabel?.trim()) {
    return props.confirmLabel.trim();
  }
  return props.mode === "convert"
    ? t("components.dialog.createComponent")
    : t("components.dialog.create");
});

/**
 * Component creation confirmation. Validates, emits the component name, and closes the dialog.
 */
const handleConfirm = (): void => {
  const trimmedName = componentName.value.trim();
  if (!trimmedName || hasNameConflict.value || isConfirmDisabled.value) return;

  const trimmedNewGroupName = newGroupName.value.trim();

  emit("confirm", {
    name: trimmedName,
    groupId: isCreatingNewGroup.value ? null : selectedGroupId.value,
    ...(isCreatingNewGroup.value && trimmedNewGroupName
      ? { newGroupName: trimmedNewGroupName }
      : {}),
  });
  resetAndClose();
};

const handleCancel = (): void => {
  resetAndClose();
};

// LIFECYCLE & WATCHERS

/**
 * Initializes dialog state when opened.
 * Auto-generates unique name if suggested name is provided.
 */
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;

    componentName.value = props.suggestedName
      ? generateUniqueComponentName(props.suggestedName)
      : "";
    newGroupName.value = "";
    selectedGroupId.value =
      props.selectedGroupId ?? props.groups?.[0]?.id ?? null;
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent>
      <DialogHeader class="gap-0">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>
          {{ dialogDescription }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="name">{{ t("components.dialog.name") }}</Label>
        <Input
          id="name"
          v-model="componentName"
          :placeholder="t('components.dialog.namePlaceholder')"
          autofocus
          :class="hasNameConflict ? 'border-destructive' : ''"
          @keydown.enter="handleConfirm"
        />

        <div
          v-if="hasNameConflict"
          class="flex items-center gap-2 text-sm text-destructive"
        >
          <span
            aria-hidden="true"
            :class="[studioIcons.warning, 'size-4 shrink-0']"
          />
          <span>{{ t("components.dialog.nameExists") }}</span>
        </div>

        <p v-else class="text-xs text-muted-foreground/80">
          {{ t("components.dialog.slug") }}
          <span class="pl-0.5 text-muted-foreground/70">{{ slugPreview }}</span>
        </p>
      </div>

      <div v-if="props.groups?.length" class="grid gap-2">
        <Label for="group">{{ t("components.dialog.group") }}</Label>
        <Select v-model="selectedGroupId">
          <SelectTrigger id="group">
            <SelectValue :placeholder="t('components.dialog.selectGroup')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="group in props.groups"
              :key="group.id"
              :value="group.id"
            >
              {{ group.name }}
            </SelectItem>
            <SelectItem v-if="allowNewGroup" :value="NEW_GROUP_VALUE">
              {{ t("components.dialog.newGroup") }}
            </SelectItem>
          </SelectContent>
        </Select>

        <div v-if="isCreatingNewGroup" class="grid gap-2 pt-1">
          <Label for="new-group" class="text-sm text-muted-foreground">
            {{ t("components.dialog.newGroupName") }}
          </Label>
          <Input
            id="new-group"
            v-model="newGroupName"
            placeholder="e.g. Marketing"
            :class="hasDuplicateGroupName ? 'border-destructive' : ''"
            @keydown.enter="handleConfirm"
          />
          <p v-if="hasDuplicateGroupName" class="text-sm text-destructive">
            {{ t("components.dialog.groupExists") }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="destructive" size="default" @click="handleCancel"
          >{{ t("common.cancel") }}</Button
        >
        <Button
          variant="default"
          size="default"
          :disabled="isConfirmDisabled"
          @click="handleConfirm"
        >
          {{ confirmButtonLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
