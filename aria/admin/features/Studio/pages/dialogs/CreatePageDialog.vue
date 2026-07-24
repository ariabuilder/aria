<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
import { useStudioActions } from "@/features/Studio/composer/composables/useStudioActions";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { slugify } from "@/lib/utils/slugify";
import { toast } from "vue-sonner";
import type { Layout, Page } from "@/composables/useBuilderData";
import { useStudioI18n } from "@/i18n";

interface Props {
  open: boolean;
  pages: readonly Page[];
  layouts: readonly Layout[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  created: [slug: string];
}>();

const { createPage } = useStudioActions();
const { t } = useStudioI18n();
const { canCreatePage, getForbiddenMessage } = useStudioCapabilities();

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && !canCreatePage.value) {
      toast.error(getForbiddenMessage("crud.createItem"));
      emit("update:open", false);
    }
  },
);

const title = ref("");
const pageSlug = ref("");
const selectedLayout = ref("__none__");
const parent = ref("__root__");
const isSlugEdited = ref(false);
const isCreating = ref(false);
const errors = ref<Record<string, string>>({});

const availableParents = computed(() =>
  props.pages.filter((p) => p.slug !== "index" && p.systemRole !== "not-found"),
);

function getParentPath(parentSlug: string): string {
  const segments: string[] = [];
  const pageMap = new Map(props.pages.map((p) => [p.slug, p]));
  let currentSlug: string | undefined = parentSlug;
  while (currentSlug) {
    const page = pageMap.get(currentSlug);
    if (!page) break;
    if (page.slug !== "index") segments.unshift(page.slug);
    currentSlug = page.parent;
  }
  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

function updateSlugFromTitle() {
  if (!isSlugEdited.value) {
    pageSlug.value = slugify(title.value);
  }
}

function resetForm() {
  title.value = "";
  pageSlug.value = "";
  selectedLayout.value = "__none__";
  parent.value = "__root__";
  isSlugEdited.value = false;
  errors.value = {};
}

function validate(): boolean {
  errors.value = {};
  if (!title.value.trim()) errors.value.title = t("pages.titleRequired");
  return Object.keys(errors.value).length === 0;
}

async function submitCreate() {
  if (!validate()) return;
  isCreating.value = true;
  try {
    const slug = await createPage({
      title: title.value.trim(),
      slug: pageSlug.value.trim() || undefined,
      parent: parent.value === "__root__" ? null : parent.value,
      layout: selectedLayout.value === "__none__" ? "" : selectedLayout.value,
    });
    if (slug) {
      emit("created", slug);
      resetForm();
      emit("update:open", false);
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("pages.createFailed"));
  } finally {
    isCreating.value = false;
  }
}

function handleClose(v: boolean) {
  if (!v) resetForm();
  emit("update:open", v);
}
</script>

<template>
  <Dialog :open="open" @update:open="handleClose">
    <DialogContent class="sm:max-w-[525px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("pages.createTitle") }}</DialogTitle>
        <DialogDescription>
          {{ t("pages.createDescription") }}
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-2">
        <Label for="create-title">{{ t("pages.name") }}</Label>
        <Input
          id="create-title"
          v-model="title"
          :placeholder="t('pages.namePlaceholder')"
          :class="errors.title ? 'border-destructive' : ''"
          @input="updateSlugFromTitle"
          @keydown.enter="submitCreate"
        />
        <p v-if="errors.title" class="text-xs text-destructive">
          {{ errors.title }}
        </p>
      </div>
      <div class="grid gap-2">
        <Label for="create-slug">{{ t("pages.slugLabel") }}</Label>
        <Input
          id="create-slug"
          v-model="pageSlug"
          placeholder="about-us"
          @input="isSlugEdited = true"
          @keydown.enter="submitCreate"
        />
      </div>
      <div class="grid gap-2">
        <Label for="create-parent">{{ t("pages.parent") }}</Label>
        <Select v-model="parent">
          <SelectTrigger>
            <SelectValue :placeholder="t('pages.root')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__root__">{{ t("pages.root") }}</SelectItem>
            <SelectItem
              v-for="page in availableParents"
              :key="page.id"
              :value="page.slug"
            >
              {{ page.title }} ({{ getParentPath(page.slug) }})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="grid gap-2">
        <Label for="create-layout">{{ t("pages.layout") }}</Label>
        <Select v-model="selectedLayout">
          <SelectTrigger>
            <SelectValue :placeholder="t('pages.selectLayout')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{{ t("pages.none") }}</SelectItem>
            <SelectItem
              v-for="layout in layouts"
              :key="layout.id"
              :value="layout.id"
            >
              {{ layout.title || layout.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="destructive" size="lg" @click="handleClose(false)"
          >{{ t("pages.cancel") }}</Button
        >
        <Button
          variant="default"
          :disabled="isCreating"
          size="lg"
          @click="submitCreate"
        >
          {{ isCreating ? t("pages.creating") : t("pages.createTitle") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
