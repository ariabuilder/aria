<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useStudioI18n } from "@/i18n";

interface Props {
  title: string;
  description: string;
  image?: string;
  url: string;
}

const props = defineProps<Props>();
const { t } = useStudioI18n();

const imageLoadFailed = ref(false);

const previewImageSrc = computed(() => {
  const image = props.image?.trim();
  if (!image) {
    return "";
  }

  if (/^https?:\/\//i.test(image) || image.startsWith("data:")) {
    return image;
  }

  try {
    return new URL(image, window.location.origin).href;
  } catch {
    return image;
  }
});

const showImage = computed(
  () => Boolean(previewImageSrc.value) && !imageLoadFailed.value,
);

watch(
  () => props.image,
  () => {
    imageLoadFailed.value = false;
  },
);

function handleImageError(): void {
  imageLoadFailed.value = true;
}
</script>

<template>
  <div class="w-full overflow-hidden rounded-md border border-border bg-card/20">
    <div class="flex items-center justify-between gap-3 px-4 pt-4">
      <p class="m-0 text-sm font-semibold leading-none text-foreground">
        {{ t("pages.seo.socialPreview") }}
      </p>
      <span class="text-2xs text-muted-foreground/70">Open Graph</span>
    </div>

    <div class="px-4 pb-4 pt-3">
      <div class="overflow-hidden rounded-lg border border-border bg-muted/20">
        <div
          v-if="showImage"
          class="aspect-[1.91/1] bg-muted"
        >
          <img
            :src="previewImageSrc"
            alt=""
            class="h-full w-full object-cover"
            @error="handleImageError"
          />
        </div>
        <div
          v-else
          class="flex aspect-[1.91/1] items-center justify-center border-b border-border bg-muted/30"
        >
          <span class="text-xs text-muted-foreground">{{ t("pages.seo.noImage") }}</span>
        </div>
        <div class="grid gap-1 px-4 py-3">
          <p
            class="m-0 truncate text-2xs uppercase tracking-wider text-muted-foreground"
          >
            {{ url }}
          </p>
          <h4 class="m-0 line-clamp-2 text-sm font-semibold text-foreground">
            {{ title || t("pages.seo.untitled") }}
          </h4>
          <p class="m-0 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {{ description || t("pages.seo.noSocialDescription") }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
