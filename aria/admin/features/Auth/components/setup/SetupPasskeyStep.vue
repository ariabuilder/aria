<script setup lang="ts">
import { computed } from "vue";

import { useStudioI18n } from "@/i18n";
import type { PasskeyReadiness } from "../../schemas/setupWizard";
import AnimatedFingerprintIcon from "./AnimatedFingerprintIcon.vue";

const props = defineProps<{
  readiness: PasskeyReadiness;
}>();

const emit = defineEmits<{
  usePasswordSetup: [];
}>();
const { t } = useStudioI18n();

const statusCopy = computed(() => {
  switch (props.readiness) {
    case "unsupported":
      return {
        title: t("auth.passkey.unsupported.title"),
        description: t("auth.passkey.unsupported.description"),
      };
    case "insecure_context":
      return {
        title: t("auth.passkey.insecure.title"),
        description: t("auth.passkey.insecure.description"),
      };
    case "ready":
      return {
        title: t("auth.passkey.ready.title"),
        description: t("auth.passkey.ready.description"),
      };
    case "success":
      return {
        title: t("auth.passkey.success.title"),
        description: t("auth.passkey.success.description"),
      };
    case "error":
      return {
        title: t("auth.passkey.error.title"),
        description: t("auth.passkey.error.description"),
      };
    case "pending":
      return {
        title: t("auth.passkey.pending.title"),
        description: t("auth.passkey.pending.description"),
      };
    case "checking":
      return {
        title: t("auth.passkey.checking.title"),
        description: t("auth.passkey.checking.description"),
      };
    case "backend_unavailable":
      return {
        title: t("auth.passkey.backend.title"),
        description: t("auth.passkey.backend.description"),
      };
  }
});

const shouldLoopFingerprint = computed(
  () =>
    props.readiness === "checking" ||
    props.readiness === "pending",
);
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-1">
      <h2 class="font-serif text-xl font-medium text-foreground m-0">
        {{ t("auth.passkey.title") }}
      </h2>
      <p class="text-sm leading-relaxed text-muted-foreground">
        {{ t("auth.passkey.description") }}
      </p>
    </div>

    <div class="flex items-start gap-2 text-sm leading-relaxed">
      <AnimatedFingerprintIcon
        class="mt-3 size-10 text-primary"
        :loop="shouldLoopFingerprint"
      />
      <div class="space-y-0 mt-2">
        <p class="font-medium text-foreground m-0">{{ statusCopy.title }}</p>
        <p class="text-muted-foreground m-0 text-balance">{{ statusCopy.description }}</p>
      </div>
    </div>

    <p class="text-center">
      <button
        type="button"
        class="text-sm text-muted-foreground hover:text-primary transition-colors"
        @click="emit('usePasswordSetup')"
      >
        {{ t("auth.usePasswordSetup") }}
      </button>
    </p>
  </div>
</template>
