<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import type { AriaCollection, PublicComment } from "../../../../lib/cms/schemas";
import { useCmsCapabilities } from "../composables/useCmsCapabilities";

const props = defineProps<{ collection: AriaCollection }>();
const { canModerateComments, getForbiddenMessage } = useCmsCapabilities();
const comments = ref<PublicComment[]>([]);
const metrics = ref<{ pending: number; approved: number; rejected: number; spam: number; deleted: number; oldestPendingAt: string | null } | null>(null);
const isLoading = ref(false);
const changingId = ref<string | null>(null);

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

async function load(): Promise<void> {
  if (!canModerateComments.value) return;
  isLoading.value = true;
  try {
    const [result, metricsResult] = await Promise.all([
      actions.cms.comments.listModerationQueue({
      collectionId: props.collection.id,
      status: "pending",
      limit: 50,
      }),
      actions.cms.comments.metrics({ collectionId: props.collection.id }),
    ]);
    if (result.error) throw result.error;
    if (metricsResult.error) throw metricsResult.error;
    comments.value = result.data ?? [];
    metrics.value = metricsResult.data ?? null;
  } catch (error) {
    comments.value = [];
    metrics.value = null;
    toast.error(error instanceof Error ? error.message : "Failed to load comments");
  } finally {
    isLoading.value = false;
  }
}

async function moderate(comment: PublicComment, nextStatus: "approved" | "rejected" | "spam" | "deleted"): Promise<void> {
  changingId.value = comment.id;
  try {
    const result = await actions.cms.comments.moderate({
      commentId: comment.id,
      expectedStatus: comment.status,
      nextStatus,
    });
    if (result.error) throw result.error;
    comments.value = comments.value.filter((item) => item.id !== comment.id);
    toast.success(`Comment ${nextStatus}`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Unable to moderate comment");
    await load();
  } finally {
    changingId.value = null;
  }
}

onMounted(() => void load());
watch(() => props.collection.id, () => void load());
</script>

<template>
  <section
    v-if="collection.supports.includes('comments')"
    class="border-t border-border/60 pt-6"
    aria-label="Public comment moderation"
  >
    <div class="space-y-1">
      <h3 class="text-sm font-medium text-foreground">Comment moderation</h3>
      <p class="text-xs leading-5 text-muted-foreground">Pending comments stay private until approved.</p>
    </div>
    <template v-if="canModerateComments">
      <p v-if="metrics" class="m-0 mt-2 text-xs text-muted-foreground">
        {{ metrics.pending }} pending · {{ metrics.approved }} approved · {{ metrics.spam }} spam
        <span v-if="metrics.oldestPendingAt"> · oldest pending {{ formatDate(metrics.oldestPendingAt) }}</span>
      </p>
      <p v-if="isLoading" class="mt-4 text-xs text-muted-foreground">Loading pending comments…</p>
      <p v-else-if="comments.length === 0" class="mt-4 text-xs text-muted-foreground">No pending comments.</p>
      <div v-else class="mt-4 grid gap-3">
        <article v-for="comment in comments" :key="comment.id" class="rounded-lg border p-4">
          <p class="m-0 text-sm text-foreground whitespace-pre-wrap">{{ comment.body }}</p>
          <p class="m-0 mt-2 text-xs text-muted-foreground">{{ comment.authorName }} · {{ comment.locale }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <Button size="sm" :disabled="changingId === comment.id" @click="moderate(comment, 'approved')">Approve</Button>
            <Button size="sm" variant="outline" :disabled="changingId === comment.id" @click="moderate(comment, 'rejected')">Reject</Button>
            <Button size="sm" variant="outline" :disabled="changingId === comment.id" @click="moderate(comment, 'spam')">Spam</Button>
          </div>
        </article>
      </div>
    </template>
    <p v-else class="mt-4 text-xs text-muted-foreground">{{ getForbiddenMessage('cms.comments.moderate') }}</p>
  </section>
</template>
