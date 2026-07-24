<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { usePropertySave } from "../../Core";
import MediaPickerDialog from "@/features/Studio/media/components/MediaPickerDialog.vue";
import type { MediaAsset } from "@/features/Studio/media/types/media";
import BaseProperty from "./BaseProperty.vue";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { useStudioI18n } from "@/i18n";

interface Props {
  defaultOpen?: boolean;
  open?: boolean;
  currentItemType?: "page" | "layout" | "component";
  currentItemSlug?: string;
}

const props = withDefaults(defineProps<Props>(), {
  defaultOpen: false,
  open: undefined,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();
const { t } = useStudioI18n();

const { selectedNode, selectedNodeId, isLoading, error, saveProperties } =
  usePropertySave();

interface SvgValue {
  viewBox: string;
  width: string;
  height: string;
  fill: string;
  stroke: string;
  "stroke-width": string;
  "stroke-linecap": string;
  "stroke-linejoin": string;
  content: string;
}

const DEFAULT_SVG_VALUE: SvgValue = {
  viewBox: "0 0 24 24",
  width: "24",
  height: "24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": "1.5",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  content: "",
};

const SVG_MIME_TYPE = "image/svg+xml";
const SVG_FILE_EXTENSION_RE = /\.svg($|[?#])/i;

const viewBox = ref("0 0 24 24");
const width = ref("24");
const height = ref("24");
const fill = ref("none");
const stroke = ref("currentColor");
const strokeWidth = ref("1.5");
const strokeLinecap = ref("round");
const strokeLinejoin = ref("round");
const content = ref("");
const validationError = ref<string | null>(null);
const isImporting = ref(false);
const isMediaPickerOpen = ref(false);

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
  extraDisabled: () => isImporting.value,
});
const hasSvgChanges = computed(
  () =>
    viewBox.value !== DEFAULT_SVG_VALUE.viewBox ||
    width.value !== DEFAULT_SVG_VALUE.width ||
    height.value !== DEFAULT_SVG_VALUE.height ||
    fill.value !== DEFAULT_SVG_VALUE.fill ||
    stroke.value !== DEFAULT_SVG_VALUE.stroke ||
    strokeWidth.value !== DEFAULT_SVG_VALUE["stroke-width"] ||
    strokeLinecap.value !== DEFAULT_SVG_VALUE["stroke-linecap"] ||
    strokeLinejoin.value !== DEFAULT_SVG_VALUE["stroke-linejoin"] ||
    content.value.trim().length > 0,
);
const hasSvgContent = computed(() => content.value.trim().length > 0);
const previewMarkup = computed(() => {
  if (!hasSvgContent.value) {
    return "";
  }

  const attributes = [
    ["xmlns", "http://www.w3.org/2000/svg"],
    ["viewBox", viewBox.value],
    ["width", width.value],
    ["height", height.value],
    ["fill", fill.value],
    ["stroke", stroke.value],
    ["stroke-width", strokeWidth.value],
    ["stroke-linecap", strokeLinecap.value],
    ["stroke-linejoin", strokeLinejoin.value],
  ]
    .filter(([, value]) => value.trim().length > 0)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  return `<svg ${attributes}>${content.value}</svg>`;
});

const syncSvgState = (node: { props?: Record<string, unknown> } | null) => {
  const nodeProps = node?.props ?? {};

  viewBox.value = getStringProp(nodeProps.viewBox, "0 0 24 24");
  width.value = getStringProp(nodeProps.width, "24");
  height.value = getStringProp(nodeProps.height, "24");
  fill.value = getStringProp(nodeProps.fill, "none");
  stroke.value = getStringProp(nodeProps.stroke, "currentColor");
  strokeWidth.value = getStringProp(nodeProps["stroke-width"], "1.5");
  strokeLinecap.value = getStringProp(nodeProps["stroke-linecap"], "round");
  strokeLinejoin.value = getStringProp(nodeProps["stroke-linejoin"], "round");
  content.value = getStringProp(nodeProps.content, "");
};

watch(
  selectedNode,
  (node) => {
    syncSvgState(node ?? null);
  },
  { deep: true, immediate: true },
);

const buildCandidate = (updates: Partial<SvgValue> = {}): SvgValue => ({
  viewBox: normalizeString(updates.viewBox ?? viewBox.value, "0 0 24 24"),
  width: normalizeString(updates.width ?? width.value, "24"),
  height: normalizeString(updates.height ?? height.value, "24"),
  fill: normalizeString(updates.fill ?? fill.value, "none"),
  stroke: normalizeString(updates.stroke ?? stroke.value, "currentColor"),
  "stroke-width": normalizeString(
    updates["stroke-width"] ?? strokeWidth.value,
    "1.5",
  ),
  "stroke-linecap": normalizeString(
    updates["stroke-linecap"] ?? strokeLinecap.value,
    "round",
  ),
  "stroke-linejoin": normalizeString(
    updates["stroke-linejoin"] ?? strokeLinejoin.value,
    "round",
  ),
  content:
    typeof updates.content === "string" ? updates.content : content.value,
});

const saveSvg = async (updates: Partial<SvgValue>) => {
  if (
    !selectedNodeId.value ||
    !props.currentItemType ||
    !props.currentItemSlug
  ) {
    return;
  }

  const candidate = buildCandidate(updates);
  validationError.value = null;

  const success = await saveProperties(
    candidate,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    syncSvgState({ props: candidate });
  }
};

const openMediaPicker = () => {
  validationError.value = null;
  isMediaPickerOpen.value = true;
};

const handleMediaSelect = async (asset: MediaAsset): Promise<void> => {
  if (!isSvgAsset(asset)) {
    validationError.value = t("inspector.svg.selectFileError");
    return;
  }

  isImporting.value = true;
  validationError.value = null;

  try {
    const markup = await loadSvgMarkup(asset);
    const parsedSvg = parseSvgMarkup(markup);
    await saveSvg(parsedSvg);
  } catch (importError) {
    validationError.value =
      importError instanceof Error
        ? importError.message
        : t("inspector.svg.importError");
  } finally {
    isImporting.value = false;
  }
};

function getStringProp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
}

function normalizeString(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSvgAsset(asset: MediaAsset): boolean {
  if (asset.mimeType === SVG_MIME_TYPE) {
    return true;
  }

  return [
    asset.name,
    asset.publicUrl,
    asset.url,
    asset.deliveryUrl,
    asset.thumbnailUrl,
  ].some(
    (value) => typeof value === "string" && SVG_FILE_EXTENSION_RE.test(value),
  );
}

function resolveSvgAssetUrl(asset: MediaAsset): string {
  return asset.publicUrl || asset.url || asset.deliveryUrl || "";
}

async function loadSvgMarkup(asset: MediaAsset): Promise<string> {
  const assetUrl = resolveSvgAssetUrl(asset);
  if (!assetUrl) {
    throw new Error("That SVG is missing a usable file URL.");
  }

  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error("Could not load that SVG from the media library.");
  }

  const markup = await response.text();
  if (!markup.trim()) {
    throw new Error("That SVG file is empty.");
  }

  return markup;
}

function parseSvgMarkup(markup: string): SvgValue {
  const parsed = new DOMParser().parseFromString(markup, SVG_MIME_TYPE);
  const parserError = parsed.querySelector("parsererror");
  const svgElement = parsed.querySelector("svg");

  if (parserError || !svgElement) {
    throw new Error("Could not read that SVG file.");
  }

  stripUnsafeSvg(svgElement);

  return {
    viewBox: svgElement.getAttribute("viewBox")?.trim() || "0 0 24 24",
    width: svgElement.getAttribute("width")?.trim() || "24",
    height: svgElement.getAttribute("height")?.trim() || "24",
    fill: svgElement.getAttribute("fill")?.trim() || "none",
    stroke: svgElement.getAttribute("stroke")?.trim() || "currentColor",
    "stroke-width": svgElement.getAttribute("stroke-width")?.trim() || "1.5",
    "stroke-linecap":
      svgElement.getAttribute("stroke-linecap")?.trim() || "round",
    "stroke-linejoin":
      svgElement.getAttribute("stroke-linejoin")?.trim() || "round",
    content: svgElement.innerHTML.trim(),
  };
}

function stripUnsafeSvg(svgElement: Element): void {
  svgElement.querySelectorAll("script").forEach((scriptElement) => {
    scriptElement.remove();
  });

  const elements = [
    svgElement,
    ...Array.from(svgElement.querySelectorAll("*")),
  ];
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (
        (attribute.name === "href" || attribute.name === "xlink:href") &&
        /^javascript:/i.test(attribute.value.trim())
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

async function resetSvg(): Promise<void> {
  validationError.value = null;
  await saveSvg(DEFAULT_SVG_VALUE);
}
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="defaultOpen"
    :has-changes="hasSvgChanges"
    :show-reset="hasSvgChanges"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.svg.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetSvg()"
    title="SVG"
  >
    <div class="space-y-3">
      <div
        class="rounded-md border border-border/50 bg-muted/20 p-2.5 space-y-2.5"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="text-[10px] uppercase tracking-wide text-muted-foreground"
            >{{ t("inspector.svg.preview") }}</span
          >
          <Button
            variant="outline"
            size="sm"
            class="h-7 px-2 text-[11px]"
            :disabled="isPanelDisabled"
            @click="openMediaPicker"
          >
            {{ hasSvgContent ? t("inspector.svg.replace") : t("inspector.svg.upload") }}
          </Button>
        </div>

        <div
          class="border border-border/50 bg-background/60 rounded-md h-28 flex items-center justify-center overflow-hidden p-4"
        >
          <div
            v-if="previewMarkup"
            class="flex max-h-full max-w-full items-center justify-center text-foreground [&_svg]:h-full [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:w-full"
            v-html="previewMarkup"
          />
          <div v-else class="text-xs text-muted-foreground text-center px-3">
            {{ t("inspector.svg.empty") }}
          </div>
        </div>

        <p class="text-[11px] text-muted-foreground leading-relaxed">
          {{ t("inspector.svg.hint") }}
        </p>
      </div>

      <div v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </div>

      <div v-if="error" class="text-xs text-red-500">
        {{ error }}
      </div>

      <MediaPickerDialog
        :open="isMediaPickerOpen"
        media-type="image"
        :title="t('inspector.svg.select')"
        :description="t('inspector.svg.selectDescription')"
        @update:open="isMediaPickerOpen = $event"
        @select="handleMediaSelect"
      />
    </div>
  </BaseProperty>
</template>
