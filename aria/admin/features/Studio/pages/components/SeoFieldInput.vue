<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

interface Props {
  label: string;
  modelValue: string;
  maxLength: number;
  helpText?: string;
  hintText?: string;
  hintTone?: "muted" | "success" | "warning" | "error";
  placeholder?: string;
  showAiSuggest?: boolean;
}

interface Emits {
  "update:modelValue": [value: string];
  "ai-suggest": [];
}

const props = withDefaults(defineProps<Props>(), {
  helpText: "",
  hintText: "",
  hintTone: "muted",
  placeholder: "",
  showAiSuggest: false,
});
const { t } = useStudioI18n();

const emit = defineEmits<Emits>();

const charCount = computed(() => props.modelValue.length);

const counterColor = computed(() => {
  switch (props.hintTone) {
    case "success":
      return "text-emerald-400";
    case "warning":
      return "text-amber-400";
    case "error":
      return "text-red-400";
    default:
      return "text-muted-foreground";
  }
});

const counterTooltip = computed(
  () => props.hintText || `${charCount.value} of ${props.maxLength} characters`,
);
</script>

<template>
  <div class="grid gap-2">
    <div class="flex min-h-7 items-center justify-between gap-3">
      <Label class="text-sm! text-muted-foreground">
        {{ label }}
        <span
          v-if="helpText"
          :class="[studioIcons.info, 'size-3 ml-1 text-muted-foreground inline-block align-middle']"
        />
      </Label>
      <TooltipProvider
        :delay-duration="150"
        :disable-hoverable-content="true"
      >
        <Tooltip>
          <TooltipTrigger as-child>
            <span
              class="inline-flex shrink-0 cursor-help items-center gap-1 text-2xs tabular-nums transition-colors"
              :class="counterColor"
              tabindex="0"
              :aria-label="counterTooltip"
            >
              {{ charCount }} / {{ maxLength }}
              <span
                v-if="hintTone === 'success'"
                :class="[studioIcons.check, 'size-3']"
                aria-hidden="true"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" class="max-w-56">
            {{ counterTooltip }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        v-if="showAiSuggest"
        variant="ghost"
        size="icon-sm"
        class="size-7"
        :aria-label="t('pages.seo.suggestAi')"
        @click="emit('ai-suggest')"
      >
        <span :class="[studioIcons.sparkles, 'size-3.5']" />
      </Button>
    </div>

    <div class="grid gap-1.5">
      <Input
        v-if="maxLength <= 80"
        :model-value="modelValue"
        :placeholder="placeholder"
        :maxlength="maxLength"
        class="h-9"
        @update:model-value="emit('update:modelValue', String($event))"
      />
      <Textarea
        v-else
        :model-value="modelValue"
        :placeholder="placeholder"
        :maxlength="maxLength"
        auto-grow
        class="min-h-24"
        @update:model-value="emit('update:modelValue', String($event))"
      />
    </div>
  </div>
</template>
