<script setup lang="ts">
import { ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { IconPickerDialog } from "@/components/ui/icon-picker";
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
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import {
  useCreateCollectionForm,
  type CreatedCollectionResult,
} from "../composables/useCreateCollectionForm";
import { useCollectionIcons } from "../composables/useCollectionIcons";
import CmsCollectionIconPreview from "../components/CmsCollectionIconPreview.vue";
import { COLLECTION_KIND_OPTIONS } from "../lib/collectionKindOptions";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  created: [collection: CreatedCollectionResult];
}>();

const { canCreateCollection, getForbiddenMessage } = useCmsCapabilities();
const {
  label,
  name,
  kind,
  iconName,
  isNameEdited,
  isCreating,
  errors,
  updateNameFromLabel,
  resetForm,
  submitCreate,
} = useCreateCollectionForm();
const { getCollectionIcon } = useCollectionIcons();
const { t } = useStudioI18n();
const isIconPickerOpen = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !canCreateCollection.value) {
      toast.error(getForbiddenMessage("cms.collections.create"));
      emit("update:open", false);
    }
  },
);

async function handleSubmit(): Promise<void> {
  const collection = await submitCreate();
  if (!collection) return;
  emit("created", collection);
  emit("update:open", false);
}

function handleClose(open: boolean): void {
  if (!open) {
    resetForm();
  }
  emit("update:open", open);
}

function handleIconSelect(icon: string): void {
  iconName.value = icon || "i-hugeicons:file-01";
}

function kindLabel(kindValue: typeof kind.value): string {
  return t(`collections.kind.${kindValue}` as const);
}

function kindDescription(kindValue: typeof kind.value): string {
  const key = kindValue === "content"
    ? "collections.kind.contentDescription"
    : kindValue === "data"
      ? "collections.kind.dataDescription"
      : kindValue === "config"
        ? "collections.kind.configDescription"
        : "collections.kind.tagsDescription";
  return t(key);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[525px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("collections.create.title") }}</DialogTitle>
        <DialogDescription>
          {{ t("collections.create.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="create-collection-label" class="text-sm! text-muted-foreground">{{ t("collections.create.name") }}</Label>
        <div class="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            class="h-9! w-9! shrink-0"
            @click="isIconPickerOpen = true"
          >
            <CmsCollectionIconPreview
              :value="getCollectionIcon(iconName)"
              class="size-5"
            />
          </Button>
          <Input
            id="create-collection-label"
            v-model="label"
            :placeholder="t('collections.create.namePlaceholder')"
            :class="errors.label ? 'border-destructive' : ''"
            @input="updateNameFromLabel"
            @keydown.enter="handleSubmit"
          />
        </div>
        <p v-if="errors.label" class="text-xs text-destructive">
          {{ errors.label }}
        </p>
      </div>

      <div class="grid gap-2">
        <Label for="create-collection-name" class="text-sm! text-muted-foreground">{{ t("collections.create.apiName") }}</Label>
        <Input
          id="create-collection-name"
          v-model="name"
          placeholder="blog-posts"
          :class="errors.name ? 'border-destructive' : ''"
          @input="isNameEdited = true"
          @keydown.enter="handleSubmit"
        />
        <p class="text-xs text-muted-foreground">
          {{ t("collections.create.apiHelp") }}
        </p>
        <p v-if="errors.name" class="text-xs text-destructive">
          {{ errors.name }}
        </p>
      </div>

      <div class="grid gap-2">
        <Label class="text-sm! text-muted-foreground">{{ t("collections.create.kind") }}</Label>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            v-for="option in COLLECTION_KIND_OPTIONS"
            :key="option.value"
            type="button"
            :class="[
              'group min-h-24 rounded-md border border-dashed p-3 text-left transition-all duration-100',
              kind === option.value
                ? 'border-primary bg-input text-foreground shadow-xs'
                : 'border-border/50 bg-card/40 text-muted-foreground hover:border-primary/50 hover:bg-input/60 hover:text-foreground',
            ]"
            @click="kind = option.value"
          >
            <div class="flex items-start gap-2.5">
              <span
                :class="[
                  option.icon,
                  'mt-0.5 size-4 shrink-0',
                  kind === option.value
                    ? 'text-primary'
                    : 'text-muted-foreground/60 group-hover:text-primary/80',
                ]"
              />
              <span class="min-w-0">
                <span class="block text-sm font-medium">
                  {{ kindLabel(option.value) }}
                </span>
                <span
                  class="mt-1 block text-xs text-balance leading-snug text-muted-foreground"
                >
                  {{ kindDescription(option.value) }}
                </span>
              </span>
            </div>
          </button>
        </div>
        <p v-if="errors.kind" class="text-xs text-destructive">
          {{ errors.kind }}
        </p>
      </div>

      <IconPickerDialog
        v-model:open="isIconPickerOpen"
        :title="t('collections.create.iconTitle')"
        :description="t('collections.create.iconDescription')"
        :value="iconName"
        @select="handleIconSelect"
      />

      <DialogFooter>
        <Button variant="destructive" size="lg" @click="handleClose(false)">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="default"
          size="lg"
          :disabled="isCreating"
          @click="handleSubmit"
        >
          {{ isCreating ? t("collections.create.creating") : t("collections.create.title") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
