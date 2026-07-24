import { computed, defineComponent, h, ref, watch } from "vue";
import { studioIcons } from "@/lib/icons";
import { useMediaAssets } from "@/features/Studio/media/composables/useMediaAssets";
import { getThumbnailUrl, handleThumbnailError } from "@/features/Studio/media/utils";
import { extractCmsEntryCover } from "../lib/entryCover";
import { resolveCmsMediaPreviewUrl } from "../lib/resolveMediaPreviewUrl";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import type { PropType } from "vue";

export default defineComponent({
  name: "CmsEntryCoverThumb",
  props: {
    frontmatter: {
      type: Object as PropType<Record<string, unknown>>,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    variant: {
      type: String as PropType<"table" | "card">,
      default: "table",
    },
    coverSupported: {
      type: Boolean,
      default: true,
    },
  },
  setup(props) {
    const { assets, loadAssets } = useMediaAssets();
    const coverFailed = ref(false);
    const cover = computed(() =>
      props.coverSupported ? extractCmsEntryCover(props.frontmatter) : null,
    );
    const coverAsset = computed<MediaAsset | null>(() => {
      const mediaId = cover.value?.mediaId;
      if (!mediaId) {
        return null;
      }
      return (
        assets.value.find(
          (asset) => asset.id === mediaId && asset.type === "image",
        ) ??
        assets.value.find(
          (asset) => asset.id === mediaId && asset.type === "icon",
        ) ??
        null
      );
    });
    const coverUrl = computed(() => {
      if (coverFailed.value) {
        return "";
      }
      const asset = coverAsset.value;
      if (asset) {
        return getThumbnailUrl(asset);
      }
      const mediaId = cover.value?.mediaId;
      return cover.value?.url ?? (mediaId ? resolveCmsMediaPreviewUrl(mediaId) : "");
    });
    const coverAlt = computed(
      () => cover.value?.alt?.trim() || props.title || "Entry cover",
    );
    const rootClass = computed(() =>
      props.variant === "card"
        ? "absolute inset-0 grid place-items-center bg-muted/25"
        : "grid h-10 w-12 place-items-center overflow-hidden rounded-md bg-card/30",
    );
    const iconClass = computed(() =>
      props.variant === "card"
        ? "size-8 text-muted-foreground/30"
        : "size-4 text-muted-foreground/40",
    );

    function handleCoverError(event: Event): void {
      const asset = coverAsset.value;
      if (asset) {
        handleThumbnailError(event, asset);
        return;
      }
      coverFailed.value = true;
    }

    watch(
      () => cover.value?.mediaId ?? "",
      (mediaId) => {
        coverFailed.value = false;
        if (mediaId && !coverAsset.value) {
          void loadAssets({ silent: true });
        }
      },
      { immediate: true },
    );

    return () =>
      h("div", { class: rootClass.value }, [
        coverUrl.value
          ? h("img", {
              src: coverUrl.value,
              alt: coverAlt.value,
              class: "h-full w-full object-cover",
              loading: "lazy",
              onError: handleCoverError,
            })
          : h("span", {
              class: [studioIcons.image, iconClass.value],
            }),
      ]);
  },
});
