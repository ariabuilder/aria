<script setup lang="ts">
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStudioI18n } from "@/i18n";
import type { SetupWizardData } from "../../schemas/setupWizard";

const formData = defineModel<SetupWizardData>("formData", { required: true });
const { t } = useStudioI18n();
</script>

<template>
  <div class="space-y-7">
    <div class="space-y-2">
      <Label
        for="setup-username"
        class="text-2xs! font-mono font-medium uppercase tracking-wider text-muted-foreground/80"
      >
        {{ t("auth.username") }}
      </Label>
      <Input
        id="setup-username"
        v-model="formData.username"
        type="text"
        autocomplete="username"
        :placeholder="t('auth.chooseUsername')"
        minlength="3"
        maxlength="30"
        required
        class="border-dashed bg-background-70"
      />
      <p class="pl-1 text-2xs text-muted-foreground">
        {{ t("auth.usernameHelp") }}
      </p>
    </div>

    <div class="space-y-2">
      <Label
        for="setup-email"
        class="text-2xs! font-mono font-medium uppercase tracking-wider text-muted-foreground/80"
      >
        {{ t("auth.email") }}
      </Label>
      <Input
        id="setup-email"
        v-model="formData.email"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        required
        class="border-dashed bg-background-70"
      />
      <p class="pl-1 text-2xs text-muted-foreground">
        {{ t("auth.emailRecoveryHelp") }}
      </p>
    </div>
  </div>
</template>
