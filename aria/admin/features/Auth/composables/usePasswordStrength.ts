/**
 * Calculates password strength with detailed feedback.
 */

import { computed, ref, watch, type Ref } from "vue";
import type { PasswordStrength, PasswordStrengthResult } from "../types";

export interface UsePasswordStrengthOptions {
  minLength?: number;
}

export interface UsePasswordStrengthReturn {
  strength: Ref<PasswordStrength>;
  score: Ref<number>;
  feedback: Ref<string[]>;
  percentWidth: Ref<string>;
  colorClass: Ref<string>;
}

export function calculatePasswordStrength(
  password: string,
  minLength = 7,
): PasswordStrengthResult {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < minLength) {
    feedback.push(`At least ${minLength} characters required`);
    return { strength: "weak", score: 0, feedback };
  }

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (hasLower && hasUpper) {
    score++;
  } else {
    feedback.push("Add uppercase and lowercase letters");
  }

  if (hasDigit) {
    score++;
  } else {
    feedback.push("Add numbers");
  }

  if (hasSpecial) {
    score++;
  } else {
    feedback.push("Add special characters (!@#$%...)");
  }

  let strength: PasswordStrength;
  if (score >= 5) {
    strength = "strong";
  } else if (score >= 3) {
    strength = "medium";
  } else {
    strength = "weak";
  }

  return { strength, score, feedback };
}

/**
 * Reactive password strength composable
 */
export function usePasswordStrength(
  password: Ref<string>,
  options: UsePasswordStrengthOptions = {},
): UsePasswordStrengthReturn {
  const { minLength = 7 } = options;

  const result = ref<PasswordStrengthResult>({
    strength: "weak",
    score: 0,
    feedback: [],
  });

  watch(
    password,
    (newPassword) => {
      result.value = calculatePasswordStrength(newPassword, minLength);
    },
    { immediate: true },
  );

  const strength = computed(() => result.value.strength);
  const score = computed(() => result.value.score);
  const feedback = computed(() => result.value.feedback);

  const percentWidth = computed(() => {
    const value = password.value;
    if (!value) return "0%";

    // Length accounts for 40% of the meter so every character moves it,
    // while character variety completes the remaining 60%.
    const lengthProgress = (Math.min(value.length, 20) / 20) * 40;
    const varietyProgress =
      (/[a-z]/.test(value) ? 10 : 0) +
      (/[A-Z]/.test(value) ? 15 : 0) +
      (/\d/.test(value) ? 15 : 0) +
      (/[^a-zA-Z0-9]/.test(value) ? 20 : 0);

    return `${Math.round(Math.min(lengthProgress + varietyProgress, 100))}%`;
  });

  const colorClass = computed(() => {
    switch (result.value.strength) {
      case "weak":
        return "bg-destructive";
      case "medium":
        return "bg-secondary";
      case "strong":
        return "bg-primary";
    }
  });

  return {
    strength,
    score,
    feedback,
    percentWidth,
    colorClass,
  };
}
