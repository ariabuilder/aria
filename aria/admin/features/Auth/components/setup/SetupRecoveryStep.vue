<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudioI18n } from "@/i18n";
import { usePasswordStrength } from "../../composables/usePasswordStrength";
import type { SetupWizardData } from "../../schemas/setupWizard";

const formData = defineModel<SetupWizardData>("formData", { required: true });
const { t } = useStudioI18n();
const passwordInput = ref<{ focus: () => void } | null>(null);

const passwordRef = computed(() => formData.value.password);
const { percentWidth, colorClass } = usePasswordStrength(passwordRef);

const hasPasswordValue = computed(() => formData.value.password.length > 0);
const hasConfirmValue = computed(
  () => formData.value.confirmPassword.length > 0,
);
const passwordsMatch = computed(
  () =>
    !formData.value.confirmPassword ||
    formData.value.password === formData.value.confirmPassword,
);

onMounted(() => {
  passwordInput.value?.focus();
});
</script>

<template>
  <div class="space-y-7">
    <div class="space-y-1">
      <h2 class="font-serif text-xl font-medium text-foreground m-0">
        {{ t("auth.recovery.title") }}
      </h2>
      <p class="text-sm leading-relaxed text-muted-foreground">
        {{ t("auth.recovery.description") }}
      </p>
    </div>

    <div class="relative space-y-2">
      <Label
        for="setup-password"
        class="text-2xs! font-mono font-medium uppercase tracking-wider text-muted-foreground/80"
      >
        {{ t("auth.recoveryPassword") }}
      </Label>
      <Input
        ref="passwordInput"
        id="setup-password"
        v-model="formData.password"
        type="password"
        autocomplete="new-password"
        :placeholder="t('auth.createRecoveryPassword')"
        required
        minlength="7"
        class="border-dashed bg-background-70"
      />
      <p class="pl-1 text-2xs text-muted-foreground">
        {{ t("auth.minimumPasswordLength") }}
      </p>
    </div>

    <div
      class="mx-6 h-1.5 overflow-hidden rounded-full bg-border transition-opacity duration-300 ease-out motion-reduce:transition-none"
      :class="hasPasswordValue ? 'opacity-50' : 'opacity-0'"
    >
      <div
        class="h-full transition-all duration-300 ease-out motion-reduce:transition-none"
        :class="colorClass"
        :style="{ width: percentWidth }"
      />
    </div>

    <div class="relative space-y-2">
      <Label
        for="setup-confirm-password"
        class="text-2xs! font-mono font-medium uppercase tracking-wider text-muted-foreground/80"
      >
        {{ t("auth.confirmPassword") }}
      </Label>
      <Input
        id="setup-confirm-password"
        v-model="formData.confirmPassword"
        type="password"
        autocomplete="new-password"
        :placeholder="t('auth.confirmRecoveryPassword')"
        required
        class="border-dashed bg-background-70"
        :aria-invalid="hasConfirmValue && !passwordsMatch"
      />
      <p
        v-if="hasConfirmValue && !passwordsMatch"
        class="pl-1 text-2xs text-destructive"
      >
        {{ t("auth.passwordsDoNotMatch") }}
      </p>
    </div>
  </div>
</template>
