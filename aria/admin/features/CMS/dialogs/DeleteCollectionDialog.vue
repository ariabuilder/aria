<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import type { z } from "zod";
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
import { handleActionResultForbidden } from "@/lib/actionErrors";
import {
  DeleteCollectionRequestSchema,
  DeleteCollectionResponseSchema,
  GetCollectionDeleteImpactRequestSchema,
  GetCollectionDeleteImpactResponseSchema,
} from "../../../../lib/cms/actionSchemas";
import type { AriaCollection } from "../../../../lib/cms/schemas";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";
import { withCmsActionTimeout } from "../lib/actionTimeout";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  open: boolean;
  collection: AriaCollection;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  deleted: [];
}>();

const { canDeleteCollection, getForbiddenMessage } = useCmsCapabilities();
const { t } = useStudioI18n();
const isDeleting = ref(false);
const isLoadingImpact = ref(false);
const deleteImpactLoadFailed = ref(false);
const deleteImpact = ref<z.infer<
  typeof GetCollectionDeleteImpactResponseSchema
> | null>(null);
const description = computed(() => {
  const base = t("collections.delete.description", {
    collection: props.collection.label,
  });
  if (deleteImpact.value && deleteImpact.value.removedPageBindingCount > 0) {
    const pageCount = deleteImpact.value.affectedPages.length;
    const bindingCount = deleteImpact.value.removedPageBindingCount;
    return `${base} ${t("collections.delete.bindingImpact", {
      bindings: bindingCount,
      bindingLabel: bindingCount === 1
        ? t("collections.delete.binding")
        : t("collections.delete.bindings"),
      pages: pageCount,
      pageLabel: pageCount === 1
        ? t("collections.delete.page")
        : t("collections.delete.pages"),
    })}`;
  }

  if (deleteImpactLoadFailed.value) {
    return `${base} ${t("collections.delete.bindingWarning")}`;
  }

  return base;
});

async function loadDeleteImpact(): Promise<void> {
  deleteImpact.value = null;
  deleteImpactLoadFailed.value = false;
  isLoadingImpact.value = true;
  try {
    const payload = GetCollectionDeleteImpactRequestSchema.parse({
      ids: [props.collection.id],
    });
    const { data, error } = await withCmsActionTimeout(
      actions.cms.collections.deleteImpact(payload),
      "Check collection bindings",
    );
    if (error) {
      deleteImpactLoadFailed.value = true;
      return;
    }
    deleteImpact.value = GetCollectionDeleteImpactResponseSchema.parse(data);
  } catch {
    deleteImpactLoadFailed.value = true;
  } finally {
    isLoadingImpact.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!canDeleteCollection.value) {
    toast.error(getForbiddenMessage("cms.collections.remove"));
    return;
  }

  if (!deleteImpact.value && !deleteImpactLoadFailed.value) {
    await loadDeleteImpact();
  }

  const payload = DeleteCollectionRequestSchema.parse({
    id: props.collection.id,
  });

  isDeleting.value = true;
  try {
    const { data, error } = await withCmsActionTimeout(
      actions.cms.collections.remove(payload),
      "Delete collection",
    );
    if (error) {
      if (handleActionResultForbidden({ error }, "cms.collections.remove")) {
        return;
      }
      toast.error(error.message ?? t("collections.delete.failed"));
      return;
    }

    const result = DeleteCollectionResponseSchema.parse(data);
    toast.success(
      result.removedPageBindingCount > 0
        ? t("collections.delete.successBindings", {
            count: result.removedPageBindingCount,
            bindingLabel: result.removedPageBindingCount === 1
              ? t("collections.delete.binding")
              : t("collections.delete.bindings"),
          })
        : t("collections.delete.success"),
    );
    emit("deleted");
    emit("update:open", false);
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : t("collections.delete.failed"),
    );
  } finally {
    isDeleting.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadDeleteImpact();
      return;
    }
    deleteImpact.value = null;
    deleteImpactLoadFailed.value = false;
  },
);
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader class="gap-0">
        <DialogTitle>{{ t("collections.deleteOne") }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          class="h-9!"
          :disabled="isDeleting || isLoadingImpact"
          @click="emit('update:open', false)"
        >
          {{ t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="h-9!"
          :disabled="isDeleting || isLoadingImpact || !canDeleteCollection"
          :title="
            canDeleteCollection
              ? t('collections.deleteOne')
              : getForbiddenMessage('cms.collections.remove')
          "
          @click="confirmDelete"
        >
          {{ isDeleting ? t("common.deleting") : t("collections.deleteOne") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
