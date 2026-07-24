<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import type { CmsEntryWorkflow, CmsReviewAnnotation } from "../../../../lib/cms/schemas";

const props = defineProps<{
  collectionId: string;
  entryId: string;
  locale: string;
  canReview: boolean;
}>();

const review = ref<CmsEntryWorkflow | null>(null);
const annotations = ref<CmsReviewAnnotation[]>([]);
const annotationBody = ref("");
const isLoading = ref(false);
const isSaving = ref(false);
const isAddingAnnotation = ref(false);
const resolvingAnnotationId = ref<string | null>(null);
const state = computed(() => review.value?.state ?? "none");
const stateLabel = computed(() => state.value.replaceAll("_", " "));

async function load(): Promise<void> {
  if (!props.canReview || !props.collectionId || !props.entryId) return;
  isLoading.value = true;
  try {
    const [result, annotationsResult] = await Promise.all([
      actions.cms.workflows.getReview({
        collectionId: props.collectionId, entryId: props.entryId, locale: props.locale,
      }),
      actions.cms.workflows.listAnnotations({
        collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, status: "open",
      }),
    ]);
    if (result.error) throw result.error;
    if (annotationsResult.error) throw annotationsResult.error;
    review.value = result.data ?? null;
    annotations.value = annotationsResult.data ?? [];
  } catch (error) {
    review.value = null;
    toast.error(error instanceof Error ? error.message : "Unable to load review status");
  } finally {
    isLoading.value = false;
  }
}

async function addAnnotation(): Promise<void> {
  const body = annotationBody.value.trim();
  if (!body) return;
  isAddingAnnotation.value = true;
  try {
    const result = await actions.cms.workflows.createAnnotation({
      collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, body,
    });
    if (result.error) throw result.error;
    if (result.data) annotations.value = [...annotations.value, result.data];
    annotationBody.value = "";
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Unable to add review note");
  } finally {
    isAddingAnnotation.value = false;
  }
}

async function resolveAnnotation(annotation: CmsReviewAnnotation): Promise<void> {
  resolvingAnnotationId.value = annotation.id;
  try {
    const result = await actions.cms.workflows.resolveAnnotation({
      collectionId: props.collectionId, entryId: props.entryId, locale: props.locale, annotationId: annotation.id,
    });
    if (result.error) throw result.error;
    annotations.value = annotations.value.filter((candidate) => candidate.id !== annotation.id);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Unable to resolve review note");
  } finally {
    resolvingAnnotationId.value = null;
  }
}

async function transition(nextState: CmsEntryWorkflow["state"]): Promise<void> {
  isSaving.value = true;
  try {
    const result = await actions.cms.workflows.updateReview({
      collectionId: props.collectionId,
      entryId: props.entryId,
      locale: props.locale,
      expectedState: review.value?.state ?? null,
      nextState,
    });
    if (result.error) throw result.error;
    review.value = result.data ?? null;
    toast.success(`Review marked ${nextState.replaceAll("_", " ")}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Review state changed; refresh and try again");
    await load();
  } finally {
    isSaving.value = false;
  }
}

watch(() => [props.collectionId, props.entryId, props.locale, props.canReview], () => void load(), { immediate: true });
</script>

<template>
  <section v-if="canReview" class="border-t border-border pt-5" aria-label="Editorial review">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="m-0 text-sm font-medium text-foreground">Editorial review</p>
        <p class="m-0 mt-1 text-xs text-muted-foreground">
          <span v-if="isLoading">Loading review…</span>
          <span v-else>Current state: <span class="capitalize">{{ stateLabel }}</span></span>
        </p>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <Button v-if="state === 'none' || state === 'changes_requested'" size="sm" variant="outline" :disabled="isSaving" @click="transition('in_review')">Request review</Button>
        <template v-else-if="state === 'in_review'">
          <Button size="sm" variant="outline" :disabled="isSaving" @click="transition('changes_requested')">Request changes</Button>
          <Button size="sm" :disabled="isSaving" @click="transition('approved')">Approve</Button>
        </template>
        <Button v-else-if="state === 'approved'" size="sm" variant="outline" :disabled="isSaving" @click="transition('in_review')">Reopen review</Button>
      </div>
    </div>
    <div class="mt-4 grid gap-2">
      <p class="m-0 text-xs font-medium text-foreground">Review notes</p>
      <p v-if="annotations.length === 0" class="m-0 text-xs text-muted-foreground">No open notes.</p>
      <div v-for="annotation in annotations" :key="annotation.id" class="flex items-start justify-between gap-3 rounded-md border border-border/70 p-3">
        <p class="m-0 whitespace-pre-wrap text-xs leading-5 text-foreground">{{ annotation.body }}</p>
        <Button size="sm" variant="ghost" :disabled="resolvingAnnotationId === annotation.id" @click="resolveAnnotation(annotation)">Resolve</Button>
      </div>
      <textarea
        v-model="annotationBody"
        class="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        maxlength="8000"
        placeholder="Add a private review note"
      />
      <div><Button size="sm" variant="outline" :disabled="isAddingAnnotation || !annotationBody.trim()" @click="addAnnotation">Add note</Button></div>
    </div>
  </section>
</template>
