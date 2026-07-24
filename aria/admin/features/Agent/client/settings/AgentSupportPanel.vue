<script setup lang="ts">
import { ref } from "vue";
import { actions } from "astro:actions";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { useStudioI18n } from "@/i18n";

defineProps<{
  canEdit: boolean;
}>();
const { t } = useStudioI18n();

const userId = ref("");
const confirmOpen = ref(false);
const confirmUserId = ref("");
const isClearing = ref(false);

function openConfirm(): void {
  const trimmed = userId.value.trim();
  if (!trimmed) {
    toast.error(t("settings.agent.support.userIdRequired"));
    return;
  }
  confirmUserId.value = trimmed;
  confirmOpen.value = true;
}

function closeConfirm(): void {
  confirmOpen.value = false;
  confirmUserId.value = "";
}

async function handleClearChat(): Promise<void> {
  isClearing.value = true;
  try {
    const { error } = await actions.agent.clearChat({
      targetUserId: confirmUserId.value,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      t("settings.agent.support.cleared", { user: confirmUserId.value }),
    );
    userId.value = "";
    closeConfirm();
  } finally {
    isClearing.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <h4 class="text-sm font-medium m-0">
        {{ t("settings.agent.support.title") }}
      </h4>
      <p class="text-xs text-muted-foreground">
        {{ t("settings.agent.support.description") }}
      </p>
    </div>

    <div class="flex items-end gap-2">
      <div class="flex-1">
        <label class="block text-2xs text-muted-foreground mb-1">{{
          t("settings.agent.support.userId")
        }}</label>
        <input
          v-model="userId"
          type="text"
          class="w-full h-8 rounded-md border border-border/50 bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          :placeholder="t('settings.agent.support.userIdPlaceholder')"
          :disabled="!canEdit"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        :disabled="!canEdit || !userId.trim()"
        @click="openConfirm"
      >
        {{ t("settings.agent.support.clear") }}
      </Button>
    </div>

    <!-- Confirm dialog -->
    <Teleport to="body">
      <div
        v-if="confirmOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        @click.self="closeConfirm"
      >
        <div
          class="mx-4 w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-lg"
        >
          <h4 class="text-sm font-medium text-foreground">
            {{ t("settings.agent.support.confirmTitle") }}
          </h4>
          <p class="mt-2 text-xs text-muted-foreground">
            {{ t("settings.agent.support.confirmBefore") }}
            <span class="font-mono text-foreground">{{ confirmUserId }}</span
            >'s
            {{ t("settings.agent.support.confirmAfter") }}
          </p>
          <div class="mt-4 flex items-center justify-end gap-2">
            <Button
              size="xs"
              variant="outline"
              :disabled="isClearing"
              @click="closeConfirm"
            >
              {{ t("common.cancel") }}
            </Button>
            <Button
              size="xs"
              variant="destructive"
              :disabled="isClearing"
              @click="handleClearChat"
            >
              {{
                isClearing
                  ? t("settings.agent.support.clearing")
                  : t("settings.agent.support.clearChat")
              }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
