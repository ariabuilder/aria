import { computed, defineComponent, h, onMounted, type PropType } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import {
  getAssetSourceUrl,
  getThumbnailUrl,
  handleThumbnailError,
} from "@/features/Studio/media/utils";
import { studioIcons } from "@/lib/icons";
import { useMediaAssets } from "@/features/Studio/media/composables/useMediaAssets";
import { useStudioI18n } from "@/i18n";
import type {
  StructuredEmbedNodeAttrs,
  StructuredImageNodeAttrs,
} from "../../../../lib/cms/structuredText";
import {
  StructuredEmbedNodeAttrsSchema,
  StructuredImageNodeAttrsSchema,
  inferEmbedProvider,
} from "../../../../lib/cms/structuredText";

type NodeViewNode = {
  attrs: unknown;
};

type UpdateAttributes = (attrs: Record<string, unknown>) => void;
type DeleteNode = () => void;
type NodeViewEditor = { isEditable?: boolean };

function actionButton(
  label: string,
  icon: string,
  onClick: () => void,
  options: { destructive?: boolean; disabled?: boolean } = {},
) {
  return h(
    "button",
    {
      type: "button",
      class: [
        "inline-flex h-7 items-center justify-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors",
        options.destructive
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        options.disabled ? "pointer-events-none opacity-40" : "",
      ],
      disabled: options.disabled,
      title: label,
      "aria-label": label,
      onClick,
    },
    [h("span", { class: [icon, "size-3.5"], "aria-hidden": "true" })],
  );
}

export const StructuredImageBlockView = defineComponent({
  name: "StructuredImageBlockView",
  props: {
    node: {
      type: Object as PropType<NodeViewNode>,
      required: true,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    updateAttributes: {
      type: Function as PropType<UpdateAttributes>,
      required: true,
    },
    deleteNode: {
      type: Function as PropType<DeleteNode>,
      required: true,
    },
    editor: {
      type: Object as PropType<NodeViewEditor>,
      required: false,
    },
  },
  setup(props) {
    const { t } = useStudioI18n();
    const { assets, loadAssets } = useMediaAssets();
    const attrs = computed<StructuredImageNodeAttrs>(() => {
      const parsed = StructuredImageNodeAttrsSchema.safeParse(props.node.attrs);
      return parsed.success
        ? parsed.data
        : { mediaId: "", alt: "", caption: "" };
    });
    const asset = computed(() =>
      assets.value.find((candidate) => candidate.id === attrs.value.mediaId),
    );
    const isEditable = computed(() => props.editor?.isEditable !== false);

    onMounted(() => {
      void loadAssets({ silent: true });
    });

    return () =>
      h(
        NodeViewWrapper,
        {
          as: "figure",
          class: [
            "my-3 overflow-hidden rounded-md border bg-background/60",
            props.selected ? "border-primary/50" : "border-border",
          ],
          "data-aria-structured-image-view": "true",
        },
        () => [
          asset.value
            ? h("img", {
                class: "block max-h-80 w-full object-cover",
                src: getThumbnailUrl(asset.value),
                alt: attrs.value.alt || asset.value.name,
                onError: (event: Event) => {
                  const currentAsset = asset.value;
                  if (currentAsset) {
                    handleThumbnailError(event, currentAsset);
                  }
                },
              })
            : h(
                "div",
                {
                  class:
                    "flex min-h-32 items-center justify-center bg-muted/20 px-4 text-sm text-muted-foreground",
                },
                t("cms.richText.missingMedia", {
                  id: attrs.value.mediaId || t("cms.richText.unknown"),
                }),
              ),
          h("div", { class: "grid gap-2 border-t border-border p-2" }, [
            h("div", { class: "flex items-center justify-between gap-2" }, [
              h("div", { class: "min-w-0" }, [
                h(
                  "div",
                  { class: "truncate text-xs font-medium text-foreground" },
                  asset.value?.name ?? attrs.value.mediaId,
                ),
                asset.value
                  ? h(
                      "div",
                      { class: "truncate text-[11px] text-muted-foreground" },
                      getAssetSourceUrl(asset.value),
                    )
                  : null,
              ]),
              actionButton(
                t("cms.richText.removeImage"),
                studioIcons.trash,
                props.deleteNode,
                { destructive: true, disabled: !isEditable.value },
              ),
            ]),
            h("input", {
              class:
                "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50",
              value: attrs.value.alt,
              disabled: !isEditable.value,
              placeholder: t("cms.field.altText"),
              "aria-label": t("cms.richText.imageAlt"),
              onInput: (event: Event) => {
                const input = event.target as HTMLInputElement;
                if (!isEditable.value) return;
                props.updateAttributes({ alt: input.value });
              },
            }),
            h("input", {
              class:
                "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50",
              value: attrs.value.caption,
              disabled: !isEditable.value,
              placeholder: t("cms.field.caption"),
              "aria-label": t("cms.richText.imageCaption"),
              onInput: (event: Event) => {
                const input = event.target as HTMLInputElement;
                if (!isEditable.value) return;
                props.updateAttributes({ caption: input.value });
              },
            }),
          ]),
        ],
      );
  },
});

export const StructuredEmbedBlockView = defineComponent({
  name: "StructuredEmbedBlockView",
  props: {
    node: {
      type: Object as PropType<NodeViewNode>,
      required: true,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    updateAttributes: {
      type: Function as PropType<UpdateAttributes>,
      required: true,
    },
    deleteNode: {
      type: Function as PropType<DeleteNode>,
      required: true,
    },
    editor: {
      type: Object as PropType<NodeViewEditor>,
      required: false,
    },
  },
  setup(props) {
    const { t } = useStudioI18n();
    const attrs = computed<StructuredEmbedNodeAttrs>(() => {
      const parsed = StructuredEmbedNodeAttrsSchema.safeParse(props.node.attrs);
      return parsed.success
        ? parsed.data
        : { provider: "embed", url: "" };
    });
    const isEditable = computed(() => props.editor?.isEditable !== false);

    return () =>
      h(
        NodeViewWrapper,
        {
          as: "div",
          class: [
            "my-3 grid gap-2 rounded-md border bg-background/60 p-2",
            props.selected ? "border-primary/50" : "border-border",
          ],
          "data-aria-structured-embed-view": "true",
        },
        () => [
          h("div", { class: "flex items-center justify-between gap-2" }, [
            h("div", { class: "flex min-w-0 items-center gap-2" }, [
              h("span", {
                class: [
                  studioIcons.externalLink,
                  "size-4 shrink-0 text-muted-foreground",
                ],
                "aria-hidden": "true",
              }),
              h("div", { class: "min-w-0" }, [
                h(
                  "div",
                  { class: "truncate text-xs font-medium text-foreground" },
                  attrs.value.provider,
                ),
                h(
                  "div",
                  { class: "truncate text-[11px] text-muted-foreground" },
                  attrs.value.url,
                ),
              ]),
            ]),
            actionButton(
              t("cms.richText.removeEmbed"),
              studioIcons.trash,
              props.deleteNode,
              { destructive: true, disabled: !isEditable.value },
            ),
          ]),
          h("input", {
            class:
              "h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/50",
            value: attrs.value.url,
            disabled: !isEditable.value,
            placeholder: "https://",
            "aria-label": t("cms.richText.embedUrl"),
            onInput: (event: Event) => {
              const input = event.target as HTMLInputElement;
              if (!isEditable.value) return;
              props.updateAttributes({
                url: input.value,
                provider: inferEmbedProvider(input.value),
              });
            },
          }),
        ],
      );
  },
});
