<script setup lang="ts">
import { computed, watch } from "vue";
import { toast } from "vue-sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ENTRY_STATUSES } from "../../../../lib/cms/constants";
import type { AriaCollection } from "../../../../lib/cms/schemas";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { useCreateEntryForm } from "../composables/useCreateEntryForm";
import CmsFrontmatterField from "../components/CmsFrontmatterField.vue";
import StructuredTextEditor from "../components/StructuredTextEditor.vue";
import { collectionSupportsBody } from "../lib/collectionBodySupport";
import { editableCmsFields } from "../lib/frontmatterForm";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
  collection: AriaCollection | null;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const emit = defineEmits<{
  "update:open": [value: boolean];
  created: [entryId: string];
}>();

const { canCreateEntry, getForbiddenMessage } = useCmsCapabilities();
const {
  title,
  slug,
  status,
  bodyDocument,
  frontmatterDraft,
  isSlugEdited,
  isCreating,
  errors,
  resetFrontmatter,
  updateSlugFromTitle,
  resetForm,
  submitCreate,
} = useCreateEntryForm();

const fields = computed(() => props.collection?.schema.fields ?? []);
const editableFields = computed(() => editableCmsFields(fields.value));
const bodyEnabled = computed(() => collectionSupportsBody(props.collection));
const statusOptions = computed(() =>
  ENTRY_STATUSES.filter((value) => value !== "archived"),
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !canCreateEntry.value) {
      toast.error(getForbiddenMessage("cms.entries.create"));
      emit("update:open", false);
      return;
    }
    if (isOpen) {
      resetFrontmatter(fields.value);
    }
  },
);

async function handleSubmit(): Promise<void> {
  if (!props.collection) return;
  const entryId = await submitCreate(
    props.collection.id,
    fields.value,
    bodyEnabled.value,
  );
  if (!entryId) return;
  emit("created", entryId);
  emit("update:open", false);
}

function handleClose(open: boolean): void {
  if (!open) {
    resetForm();
  }
  emit("update:open", open);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[525px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("cms.entry.create.title") }}</DialogTitle>
        <DialogDescription>
          {{ t("cms.entry.create.description") }}
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-2">
        <Label for="create-entry-title">{{ t("cms.title") }}</Label>
        <Input
          id="create-entry-title"
          v-model="title"
          :placeholder="t('cms.entry.create.titlePlaceholder')"
          :class="errors.title ? 'border-destructive' : ''"
          @input="updateSlugFromTitle"
          @keydown.enter="handleSubmit"
        />
        <p v-if="errors.title" class="text-xs text-destructive">
          {{ errors.title }}
        </p>
      </div>

      <div class="grid gap-2">
        <Label for="create-entry-slug">{{ t("cms.slug") }}</Label>
        <Input
          id="create-entry-slug"
          v-model="slug"
          placeholder="hello-world"
          :class="errors.slug ? 'border-destructive' : ''"
          @input="isSlugEdited = true"
        />
        <p v-if="errors.slug" class="text-xs text-destructive">
          {{ errors.slug }}
        </p>
      </div>

      <div class="grid gap-2">
        <Label for="create-entry-status">{{ t("cms.status") }}</Label>
        <Select v-model="status">
          <SelectTrigger id="create-entry-status">
            <SelectValue :placeholder="t('cms.entry.status.draft')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in statusOptions"
              :key="option"
              :value="option"
              class="capitalize"
            >
              {{ t(`cms.entry.status.${option}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="editableFields.length > 0" class="grid gap-4">
        <CmsFrontmatterField
          v-for="field in editableFields"
          :key="field.key"
          v-model="frontmatterDraft[field.key]"
          :field="field"
          :error="errors[field.key]"
        />
        <p v-if="errors.frontmatter" class="text-xs text-destructive">
          {{ errors.frontmatter }}
        </p>
      </div>

      <div v-if="bodyEnabled" class="grid gap-2">
        <Label for="create-entry-body">{{ t("cms.body") }}</Label>
        <StructuredTextEditor
          id="create-entry-body"
          v-model="bodyDocument"
          :placeholder="t('cms.entry.create.bodyPlaceholder')"
        />
        <p v-if="errors.body" class="text-xs text-destructive">
          {{ errors.body }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="destructive" size="lg" @click="handleClose(false)">
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="default"
          size="lg"
          :disabled="isCreating || !collection"
          @click="handleSubmit"
        >
          {{ isCreating ? t("cms.entries.creating") : t("cms.entry.create.title") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
