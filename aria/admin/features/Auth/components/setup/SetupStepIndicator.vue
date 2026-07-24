<script setup lang="ts">
import { computed } from "vue";

import {
  SETUP_WIZARD_STEPS,
  SetupWizardStepSchema,
  type SetupWizardStep,
} from "../../schemas/setupWizard";
import { useStudioI18n, type StudioMessageKey } from "@/i18n";

const props = defineProps<{
  currentStep: SetupWizardStep;
}>();
const { t } = useStudioI18n();

const SETUP_STEP_LABEL_KEYS = {
  account: "auth.step.account",
  passkey: "auth.step.passkey",
  recovery: "auth.step.recovery",
} as const satisfies Record<SetupWizardStep, StudioMessageKey>;

const parsedStep = computed(() => SetupWizardStepSchema.parse(props.currentStep));
const currentIndex = computed(() =>
  SETUP_WIZARD_STEPS.indexOf(parsedStep.value),
);

type SetupStepVisualState = "complete" | "current" | "upcoming";

const SETUP_STEP_ICONS = {
  account: "i-hugeicons:user-circle",
  passkey: "i-hugeicons:finger-print",
  recovery: "i-hugeicons:lock-password",
} as const satisfies Record<SetupWizardStep, string>;

function getStepState(index: number): SetupStepVisualState {
  if (index < currentIndex.value) return "complete";
  if (index === currentIndex.value) return "current";
  return "upcoming";
}

function getConnectorState(index: number): "complete" | "upcoming" {
  return index < currentIndex.value ? "complete" : "upcoming";
}
</script>

<template>
  <ol
    class="mx-auto flex max-w-full items-start justify-center"
    :aria-label="t('auth.setupProgress')"
  >
    <li
      v-for="(step, index) in SETUP_WIZARD_STEPS"
      :key="step"
      class="relative min-w-0 w-[6.25rem] sm:w-36"
      :data-state="getStepState(index)"
      :aria-current="index === currentIndex ? 'step' : undefined"
    >
      <div
        v-if="index < SETUP_WIZARD_STEPS.length - 1"
        class="absolute left-10 right-0 top-5 h-px rounded-full sm:left-12 sm:top-6"
        :class="[
          getConnectorState(index) === 'complete'
            ? 'bg-primary/70'
            : 'bg-border/50',
        ]"
        :data-state="getConnectorState(index)"
        aria-hidden="true"
      />

      <div class="relative z-1 flex min-w-0 flex-col items-start gap-2">
        <span
          class="grid size-10 shrink-0 place-items-center rounded-full border border-solid transition-colors sm:size-12"
          :class="[
            getStepState(index) === 'complete'
              ? 'border-primary bg-primary text-primary-foreground'
              : getStepState(index) === 'current'
                ? 'border-primary/70 bg-primary/10 text-primary'
                : 'border-border bg-background/30 text-muted-foreground/70',
          ]"
        >
          <span
            :class="[SETUP_STEP_ICONS[step], 'size-4 sm:size-5']"
            aria-hidden="true"
          />
        </span>
        <span
          class="max-w-full truncate text-left text-xs font-medium sm:text-sm"
          :class="[
            getStepState(index) === 'current'
              ? 'text-foreground'
              : getStepState(index) === 'complete'
                ? 'text-foreground/80'
                : 'text-muted-foreground/70',
          ]"
        >
          {{ t(SETUP_STEP_LABEL_KEYS[step]) }}
        </span>
      </div>
    </li>
  </ol>
</template>
