<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { useSettingsDialog } from "@/features/Studio/settings";
import type { AgentAvailability } from "../../lib/schemas";
import { useStudioI18n } from "@/i18n";

defineProps<{
  availability: AgentAvailability;
}>();

const settingsDialog = useSettingsDialog();
const { t } = useStudioI18n();

function openSettings(): void {
  settingsDialog.open("agent");
}
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
    <p class="text-sm text-muted-foreground">{{ t("agent.setup.description") }}</p>
    <Button variant="secondary" size="sm" @click="openSettings">{{ t("agent.setup.openSettings") }}</Button>
  </div>
</template>
