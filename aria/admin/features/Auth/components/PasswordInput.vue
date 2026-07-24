<script setup lang="ts">
/**
 * PasswordInput Component
 *
 * Reusable password input with visibility toggle and strength indicator.
 * Fully type-safe with proper event handling.
 *
 * @component
 */

import { computed } from "vue";
import { usePasswordVisibility } from "../composables/usePasswordVisibility";
import type { PasswordStrength } from "../types";
import { useStudioI18n } from "@/i18n";

// PROPS & EMITS

interface Props {
  modelValue: string;
  id: string;
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  autocomplete?: "current-password" | "new-password";
  /** Min length validation */
  minlength?: number;
  showStrength?: boolean;
  /** Current password strength (when showStrength is true) */
  strength?: PasswordStrength;
  /** Helper text below input */
  hint?: string;
  error?: string;
  /** Disable input */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "",
  required: false,
  autocomplete: "current-password",
  minlength: undefined,
  showStrength: false,
  strength: "weak",
  hint: "",
  error: "",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const { t } = useStudioI18n();

const {
  inputType,
  toggle: toggleVisibility,
  iconClass,
} = usePasswordVisibility();

const hasValue = computed(() => props.modelValue.length > 0);

const strengthWidth = computed(() => {
  switch (props.strength) {
    case "weak":
      return "33%";
    case "medium":
      return "66%";
    case "strong":
      return "100%";
  }
});

const strengthColor = computed(() => {
  switch (props.strength) {
    case "weak":
      return "bg-destructive";
    case "medium":
      return "bg-accent";
    case "strong":
      return "bg-accent";
  }
});

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  emit("update:modelValue", target.value);
}

function onToggleVisibility(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  toggleVisibility();
}
</script>

<template>
  <div class="relative">
    <!-- Label -->
    <label
      :for="id"
      class="block text-2xs font-mono font-medium text-muted-foreground mb-2 uppercase tracking-wider pl-1"
    >
      {{ label }}
    </label>

    <!-- Input Container -->
    <div class="relative">
      <input
        :id="id"
        :type="inputType"
        :name="name"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :autocomplete="autocomplete"
        :minlength="minlength"
        :disabled="disabled"
        class="w-full px-4 py-3 pr-12 bg-background-70 border border-dashed border-border rounded-md text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        :class="{ 'border-destructive': error }"
        @input="onInput"
      />

      <!-- Eye Toggle Button -->
      <button
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 text-accent cursor-pointer transition-opacity duration-200 hover:brightness-110 w-5 h-5 z-10"
        :class="[
          iconClass,
          hasValue ? 'opacity-100' : 'opacity-0 pointer-events-none',
        ]"
        tabindex="-1"
        @click="onToggleVisibility"
        :aria-label="t('auth.togglePasswordVisibility')"
      />
    </div>

    <!-- Hint Text -->
    <p v-if="hint && !error" class="text-2xs text-muted-foreground mt-2 pl-1">
      {{ hint }}
    </p>

    <!-- Error Text -->
    <p v-if="error" class="text-2xs text-destructive mt-2 pl-1">
      {{ error }}
    </p>

    <!-- Strength Indicator -->
    <div
      v-if="showStrength && hasValue"
      class="h-1.5 bg-border opacity-50 rounded-full overflow-hidden mt-4 mx-6"
    >
      <div
        class="h-full transition-all duration-200"
        :class="strengthColor"
        :style="{ width: strengthWidth }"
      />
    </div>
  </div>
</template>
