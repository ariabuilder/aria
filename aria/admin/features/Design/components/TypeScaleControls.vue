<script setup lang="ts">
import { computed } from "vue";
import { z } from "zod";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useTypography,
  type ScaleRatio,
  type SpacingStyle,
} from "../composables/useTypography";

const SpacingStyleSchema = z.enum(["compact", "normal", "relaxed", "airy"]);
const ScaleRatioSchema = z.enum([
  "minor-second",
  "major-second",
  "minor-third",
  "major-third",
  "perfect-fourth",
  "perfect-fifth",
]);

const {
  overallScale,
  spacingStyle,
  scaleRatio,
  applyOverallScale,
  applySpacingStyle,
  applyScaleRatio,
} = useTypography();

const spacingOptions: Array<{
  value: SpacingStyle;
  label: string;
  description: string;
}> = [
  {
    value: "compact",
    label: "Compact",
    description: "Tighter vertical rhythm",
  },
  { value: "normal", label: "Normal", description: "Balanced default spacing" },
  { value: "relaxed", label: "Relaxed", description: "More breathing room" },
  { value: "airy", label: "Airy", description: "Loose editorial spacing" },
];

const ratioOptions: Array<{
  value: ScaleRatio;
  label: string;
  description: string;
}> = [
  {
    value: "minor-second",
    label: "Minor Second",
    description: "Subtle hierarchy",
  },
  {
    value: "major-second",
    label: "Major Second",
    description: "Small step contrast",
  },
  { value: "minor-third", label: "Minor Third", description: "Balanced scale" },
  {
    value: "major-third",
    label: "Major Third",
    description: "Stronger contrast",
  },
  {
    value: "perfect-fourth",
    label: "Perfect Fourth",
    description: "Editorial emphasis",
  },
  {
    value: "perfect-fifth",
    label: "Perfect Fifth",
    description: "High-contrast display scale",
  },
];

const selectedSpacingLabel = computed(
  () =>
    spacingOptions.find((option) => option.value === spacingStyle.value)?.label,
);

const selectedRatioLabel = computed(
  () => ratioOptions.find((option) => option.value === scaleRatio.value)?.label,
);

function handleOverallScaleUpdate(value: number[] | undefined) {
  const nextValue = value?.[0];
  if (typeof nextValue !== "number") {
    return;
  }

  applyOverallScale(nextValue);
}

function handleSpacingStyleUpdate(value: string) {
  const parsedSpacingStyle = SpacingStyleSchema.safeParse(value);
  if (!parsedSpacingStyle.success) {
    return;
  }

  applySpacingStyle(parsedSpacingStyle.data);
}

function handleScaleRatioUpdate(value: string) {
  const parsedScaleRatio = ScaleRatioSchema.safeParse(value);
  if (!parsedScaleRatio.success) {
    return;
  }

  applyScaleRatio(parsedScaleRatio.data);
}
</script>

<template>
  <section class="rounded-4xl border border-border bg-card/70 p-6">
    <div
      class="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
    >
      <div class="space-y-4">
        <div class="flex items-end justify-between gap-4">
          <div>
            <p
              class="text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
            >
              Typography System
            </p>
            <h3
              class="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground"
            >
              Shared scale
            </h3>
          </div>
          <p class="text-sm text-muted-foreground">{{ overallScale }}%</p>
        </div>

        <div
          class="rounded-3xl border border-border/50 bg-background/70 px-5 py-5"
        >
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-foreground">Overall size</p>
              <p class="text-sm text-muted-foreground">
                Scales headings and body together.
              </p>
            </div>
          </div>

          <Slider
            :model-value="[overallScale]"
            :min="75"
            :max="150"
            :step="5"
            @update:model-value="handleOverallScaleUpdate"
          />
        </div>
      </div>

      <div
        class="space-y-3 rounded-3xl border border-border/50 bg-background/70 px-5 py-5"
      >
        <div>
          <p class="text-sm font-medium text-foreground">Line spacing</p>
          <p class="text-sm text-muted-foreground">
            {{ selectedSpacingLabel }} rhythm for the entire system.
          </p>
        </div>

        <Select
          :model-value="spacingStyle"
          @update:model-value="handleSpacingStyleUpdate(String($event))"
        >
          <SelectTrigger class="h-11 rounded-md border-border bg-card">
            <SelectValue>{{ selectedSpacingLabel }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in spacingOptions"
              :key="option.value"
              :value="option.value"
            >
              <div class="flex flex-col items-start">
                <span>{{ option.label }}</span>
                <span class="text-xs text-muted-foreground">{{
                  option.description
                }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        class="space-y-3 rounded-3xl border border-border/50 bg-background/70 px-5 py-5"
      >
        <div>
          <p class="text-sm font-medium text-foreground">Heading scale</p>
          <p class="text-sm text-muted-foreground">
            {{ selectedRatioLabel }} ratio for contrast across sizes.
          </p>
        </div>

        <Select
          :model-value="scaleRatio"
          @update:model-value="handleScaleRatioUpdate(String($event))"
        >
          <SelectTrigger class="h-11 rounded-md border-border bg-card">
            <SelectValue>{{ selectedRatioLabel }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in ratioOptions"
              :key="option.value"
              :value="option.value"
            >
              <div class="flex flex-col items-start">
                <span>{{ option.label }}</span>
                <span class="text-xs text-muted-foreground">{{
                  option.description
                }}</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </section>
</template>
