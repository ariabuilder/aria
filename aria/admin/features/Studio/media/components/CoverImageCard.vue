<script setup lang="ts">
import { ref } from "vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";

withDefaults(
  defineProps<{
    label?: string;
    required?: boolean;
    disabled?: boolean;
    hasImage?: boolean;
    imageUrl?: string;
    imageAlt?: string;
    fallbackLabel?: string;
    actionLabel?: string;
    recommendedLines?: string[];
    showAltCaption?: boolean;
    showCaption?: boolean;
    error?: string;
  }>(),
  {
    label: "Cover",
    required: false,
    disabled: false,
    hasImage: false,
    imageUrl: "",
    imageAlt: "",
    fallbackLabel: "No image selected",
    actionLabel: "Add cover",
    recommendedLines: () => [],
    showAltCaption: false,
    showCaption: true,
    error: undefined,
  },
);

const altModel = defineModel<string>("alt", { default: "" });
const captionModel = defineModel<string>("caption", { default: "" });
const { t } = useStudioI18n();

const emit = defineEmits<{
  choose: [];
  remove: [];
  imageError: [event: Event];
}>();

const isMetaOpen = ref(false);

function toggleMeta(): void {
  isMetaOpen.value = !isMetaOpen.value;
}
</script>

<template>
  <div
    class="w-full overflow-hidden rounded-md border border-solid border-border/50 bg-card/40"
    :aria-invalid="error ? 'true' : undefined"
  >
    <div class="flex items-center justify-between gap-3 px-5 pt-3">
      <p class="m-0 text-sm font-semibold leading-none text-foreground">
        {{ label }}<span v-if="required" aria-hidden="true"> *</span>
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg p-0!"
            class="shrink-0"
            :disabled="disabled"
            :aria-label="t('pages.cover.options')"
          >
            <span :class="[studioIcons.moreHorizontal, 'size-4']" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuItem
            v-if="showAltCaption"
            class="cursor-pointer text-xs"
            :disabled="disabled"
            @select="toggleMeta"
          >
            {{ showCaption ? t("pages.cover.setAltCaption") : t("pages.cover.setAlt") }}
          </DropdownMenuItem>
          <DropdownMenuItem
            class="cursor-pointer text-xs"
            :disabled="disabled"
            @select="emit('choose')"
          >
            {{ actionLabel }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="hasImage"
            class="cursor-pointer text-xs text-destructive focus:text-destructive"
            :disabled="disabled"
            @select="emit('remove')"
          >
            {{ t("pages.cover.removeImage") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="px-3 pt-1.5">
      <div
        v-if="hasImage"
        class="overflow-hidden rounded-lg border border-border bg-muted/20"
      >
        <div class="aspect-video max-w-2xl">
          <img
            v-if="imageUrl"
            :src="imageUrl"
            :alt="imageAlt || fallbackLabel"
            class="h-full w-full object-cover"
            @error="emit('imageError', $event)"
          />
          <div
            v-else
            class="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
          >
            {{ fallbackLabel }}
          </div>
        </div>
      </div>
      <button
        v-else
        type="button"
        class="flex aspect-video w-full max-w-2xl items-center justify-center rounded-lg border border-dashed border-border bg-muted/10 transition-colors hover:border-primary/40 hover:bg-muted/20 disabled:pointer-events-none disabled:opacity-50"
        :disabled="disabled"
        @click="emit('choose')"
      >
        <span :class="[studioIcons.image, 'size-6 text-muted-foreground/60']" />
      </button>
    </div>

    <div class="flex max-w-2xl items-center justify-between gap-6 px-5 py-4">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        :disabled="disabled"
        @click="emit('choose')"
      >
        {{ actionLabel }}
      </Button>
      <div
        v-if="recommendedLines.length"
        class="text-right text-3xs leading-snug text-balance text-muted-foreground"
      >
        <p v-for="line in recommendedLines" :key="line" class="m-0">{{ line }}</p>
      </div>
    </div>

    <div
      v-if="isMetaOpen && showAltCaption"
      class="grid gap-2 px-4 py-4"
    >
      <Input v-model="altModel" :placeholder="t('cms.field.altText')" :disabled="disabled" />
      <Input
        v-if="showCaption"
        v-model="captionModel"
        :placeholder="t('cms.field.caption')"
        :disabled="disabled"
      />
    </div>
  </div>
</template>
