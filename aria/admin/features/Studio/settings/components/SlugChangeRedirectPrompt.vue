<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCapabilities } from "@/composables/useCapabilities";
import { useStudioI18n } from "@/i18n";
import { useSlugChangeRedirect } from "../composables/useSlugChangeRedirect";

const { hasCapability } = useCapabilities();
const { t } = useStudioI18n();
const canManageRedirects = computed(() => hasCapability("manageRedirects"));

const {
  pendingPrompt,
  isCreating,
  dismissRedirectPrompt,
  createSuggestedRedirect,
} = useSlugChangeRedirect();

const isOpen = computed({
  get: () => pendingPrompt.value !== null && canManageRedirects.value,
  set: (open: boolean) => {
    if (!open) {
      dismissRedirectPrompt();
    }
  },
});
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{
          t("settings.redirects.slugPrompt.title")
        }}</DialogTitle>
        <DialogDescription>
          <span v-if="pendingPrompt">
            {{ t("settings.redirects.slugPrompt.beforeSource") }}
            <code class="font-mono text-xs">{{ pendingPrompt.fromPath }}</code
            >.
            {{ t("settings.redirects.slugPrompt.beforeDestination") }}
            <code class="font-mono text-xs">{{ pendingPrompt.toPath }}</code
            >?
          </span>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          variant="outline"
          :disabled="isCreating"
          @click="dismissRedirectPrompt"
        >
          {{ t("settings.redirects.slugPrompt.notNow") }}
        </Button>
        <Button :disabled="isCreating" @click="createSuggestedRedirect">
          {{ t("settings.redirects.slugPrompt.create") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
