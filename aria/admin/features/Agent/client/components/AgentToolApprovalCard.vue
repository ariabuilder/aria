<script setup lang="ts">
import { computed, ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import type { ConfirmationCategory } from "../../lib/schemas";
import { useStudioI18n } from "@/i18n";

const props = defineProps<{
  toolName: string;
  actionLabel: string;
  category: ConfirmationCategory;
  confirmationToken: string;
}>();

const emit = defineEmits<{
  confirmed: [];
  denied: [];
}>();

const isApproving = ref(false);
const isApproved = ref(false);
const isDenied = ref(false);
const { t } = useStudioI18n();

const isDestructive = computed(() =>
  ["delete_content", "publish"].includes(props.category),
);

async function handleApprove(): Promise<void> {
  isApproving.value = true;
  try {
    const { error } = await actions.agent.confirmAction({
      toolName: props.toolName,
      confirmationToken: props.confirmationToken,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("agent.approval.approved"));
    isApproved.value = true;
    emit("confirmed");
  } finally {
    isApproving.value = false;
  }
}

function handleDeny(): void {
  isDenied.value = true;
  emit("denied");
}
</script>

<template>
  <div
    v-if="isApproved"
    class="rounded-md border border-emerald-500/30 bg-emerald-50/50 px-3 py-2 text-xs dark:bg-emerald-950/10"
  >
    <p class="text-emerald-700 dark:text-emerald-400">✅ {{ t("agent.approval.approved") }}</p>
  </div>
  <div
    v-else-if="!isDenied"
    class="rounded-md border px-3 py-2 text-xs"
    :class="
      isDestructive
        ? 'border-destructive/30 bg-destructive/5'
        : 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10'
    "
  >
    <div class="mb-2 flex items-center gap-2">
      <span
        class="inline-flex size-5 items-center justify-center rounded-full text-xs font-bold"
        :class="
          isDestructive
            ? 'bg-destructive/10 text-destructive'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        "
      >
        !
      </span>
      <span class="font-medium text-foreground">{{ t("agent.approval.required") }}</span>
    </div>

    <p class="mb-2 text-muted-foreground">
      {{ t("agent.approval.description") }}
    </p>

    <p class="mb-3 font-medium text-foreground">{{ actionLabel }}</p>

    <div class="flex items-center gap-2">
      <Button
        size="xs"
        :class="isDestructive ? '' : ''"
        :variant="isDestructive ? 'destructive' : 'default'"
        :disabled="isApproving"
        @click="handleApprove"
      >
        {{ isApproving ? t("agent.approval.approving") : t("agent.approval.approve") }}
      </Button>
      <Button
        size="xs"
        variant="outline"
        :disabled="isApproving"
        @click="handleDeny"
      >
        {{ t("agent.approval.deny") }}
      </Button>
    </div>

  </div>

  <div
    v-else
    class="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground"
  >
    <p>✋ {{ t("agent.approval.denied") }}</p>
  </div>
</template>
