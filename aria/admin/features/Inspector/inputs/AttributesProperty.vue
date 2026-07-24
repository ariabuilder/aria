<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInjectedPageBlocks, usePropertySave } from "../../Core";
import {
  CONTAINER_TAG_OVERRIDES,
  HEADING_TAG_OVERRIDES,
  TEXT_TAG_OVERRIDES,
  getNativeTagForRenderableNode,
} from "../../../../lib/blocks/renderSemantics";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BaseProperty from "./BaseProperty.vue";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import { DomIdSchema } from "../../../../lib/blocks/domId";
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

const { selectedNode, selectedNodeId, isLoading, error, saveNodeUpdates } =
  usePropertySave();
const pageBlocks = useInjectedPageBlocks();

const CONTAINER_HTML_TAG_OPTIONS = CONTAINER_TAG_OVERRIDES.map((value) => ({
  value,
  label: value,
})) as const;
const TEXT_HTML_TAG_OPTIONS = TEXT_TAG_OVERRIDES.map((value) => ({
  value,
  label: value,
})) as const;
const HEADING_HTML_TAG_OPTIONS = HEADING_TAG_OVERRIDES.map((value) => ({
  value,
  label: value,
})) as const;

const ALL_HTML_TAG_VALUES = [
  ...new Set([
    ...CONTAINER_TAG_OVERRIDES,
    ...TEXT_TAG_OVERRIDES,
    ...HEADING_TAG_OVERRIDES,
  ]),
] as const;

const HtmlTagSchema = z.enum(ALL_HTML_TAG_VALUES);

type HtmlTag = (typeof ALL_HTML_TAG_VALUES)[number];

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const PROPERTY_HINT_CLASS = "text-xs text-sidebar-foreground/50";

const AriaLabelSchema = z.string().trim().max(200);
const RoleSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z][a-z0-9-]*$/, {
      message: t("inspector.attributes.invalidRole"),
    }),
]);

const tag = ref<HtmlTag>("div");
const domId = ref("");
const ariaLabel = ref("");
const role = ref("");
const showAdvanced = ref(false);
const validationError = ref<string | null>(null);

const selectedNodeType = computed(() =>
  String(selectedNode.value?.type ?? "").toLowerCase(),
);

const htmlTagOptions = computed(() => {
  if (selectedNodeType.value === "heading") {
    return HEADING_HTML_TAG_OPTIONS;
  }

  if (["text", "paragraph", "span"].includes(selectedNodeType.value)) {
    return TEXT_HTML_TAG_OPTIONS;
  }

  return CONTAINER_HTML_TAG_OPTIONS;
});

const defaultTag = computed<HtmlTag>(() => {
  const node = selectedNode.value;
  if (!node) {
    return "div";
  }

  const resolved = getNativeTagForRenderableNode(node, node.props ?? {});
  const parsed = HtmlTagSchema.safeParse(resolved);
  return parsed.success ? parsed.data : "div";
});

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPersisting, isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading,
});
const hasAttributeChanges = computed(
  () =>
    tag.value !== defaultTag.value ||
    domId.value.trim().length > 0 ||
    ariaLabel.value.trim().length > 0 ||
    role.value.trim().length > 0,
);

function traverseNodes(
  nodes: ReadonlyArray<(typeof pageBlocks.value)[number]>,
  visitor: (node: (typeof nodes)[number]) => void,
): void {
  nodes.forEach((node) => {
    visitor(node);
    if (node.children?.length) {
      traverseNodes(node.children, visitor);
    }
  });
}

const duplicateDomIdWarning = computed(() => {
  const candidate = domId.value.trim();
  if (!candidate || !selectedNodeId.value) {
    return null;
  }

  let duplicateCount = 0;
  traverseNodes(pageBlocks.value, (node) => {
    if (node.id === selectedNodeId.value) {
      return;
    }

    if (node.props?.id === candidate) {
      duplicateCount += 1;
    }
  });

  return duplicateCount > 0
    ? t("inspector.attributes.duplicateDomId", { id: candidate })
    : null;
});

watch(
  selectedNode,
  (node) => {
    const element = node?.props?.element;
    const parsed = HtmlTagSchema.safeParse(element);
    tag.value =
      parsed.success &&
      htmlTagOptions.value.some((option) => option.value === parsed.data)
        ? parsed.data
        : defaultTag.value;
    domId.value = typeof node?.props?.id === "string" ? node.props.id : "";
    ariaLabel.value =
      typeof node?.a11y?.ariaLabel === "string" ? node.a11y.ariaLabel : "";
    role.value = typeof node?.a11y?.role === "string" ? node.a11y.role : "";
    showAdvanced.value = role.value.length > 0;
    validationError.value = null;
  },
  { deep: true, immediate: true },
);

function validateTag(value: string): value is HtmlTag {
  const parsed = HtmlTagSchema.safeParse(value);
  if (
    !parsed.success ||
    !htmlTagOptions.value.some((option) => option.value === parsed.data)
  ) {
    validationError.value = t("inspector.attributes.invalidTag");
    return false;
  }

  validationError.value = null;
  return true;
}

async function saveAttributes(
  updates: Parameters<typeof saveNodeUpdates>[0],
  onSuccess: () => void,
): Promise<void> {
  if (!selectedNodeId.value) return;
  if (!props.currentItemType || !props.currentItemSlug) return;

  const success = await saveNodeUpdates(
    updates,
    props.currentItemType,
    props.currentItemSlug,
  );

  if (success) {
    validationError.value = null;
    onSuccess();
  }
}

async function updateTag(newTag: unknown): Promise<void> {
  if (typeof newTag !== "string") return;
  if (!validateTag(newTag)) return;

  const element = selectedNode.value?.props?.element;
  const parsedCurrentTag = HtmlTagSchema.safeParse(element);
  const currentTag =
    parsedCurrentTag.success &&
    htmlTagOptions.value.some(
      (option) => option.value === parsedCurrentTag.data,
    )
      ? parsedCurrentTag.data
      : defaultTag.value;

  if (currentTag === newTag) {
    tag.value = newTag;
    return;
  }

  await saveAttributes(
    {
      props: {
        element: newTag === defaultTag.value ? undefined : newTag,
      },
    },
    () => {
      tag.value = newTag;
    },
  );
}

async function saveDomId(): Promise<void> {
  const parsed = DomIdSchema.safeParse(domId.value.trim());
  if (!parsed.success) {
    validationError.value = t("inspector.attributes.invalidDomId");
    return;
  }

  const nextValue = parsed.data || undefined;
  const currentValue =
    typeof selectedNode.value?.props?.id === "string"
      ? selectedNode.value.props.id
      : undefined;

  if (currentValue === nextValue) {
    domId.value = nextValue ?? "";
    return;
  }

  await saveAttributes(
    {
      props: {
        id: nextValue,
      },
    },
    () => {
      domId.value = nextValue ?? "";
    },
  );
}

async function saveAriaLabel(): Promise<void> {
  const parsed = AriaLabelSchema.safeParse(ariaLabel.value);
  if (!parsed.success) {
    validationError.value = t("inspector.attributes.invalidAriaLabel");
    return;
  }

  const nextValue = parsed.data.trim() || undefined;
  const currentValue =
    typeof selectedNode.value?.a11y?.ariaLabel === "string"
      ? selectedNode.value.a11y.ariaLabel
      : undefined;

  if (currentValue === nextValue) {
    ariaLabel.value = nextValue ?? "";
    return;
  }

  await saveAttributes(
    {
      a11y: {
        ariaLabel: nextValue,
      },
    },
    () => {
      ariaLabel.value = nextValue ?? "";
    },
  );
}

async function saveRole(): Promise<void> {
  const parsed = RoleSchema.safeParse(role.value.trim());
  if (!parsed.success) {
    validationError.value = t("inspector.attributes.invalidRole");
    return;
  }

  const nextValue = parsed.data || undefined;
  const currentValue =
    typeof selectedNode.value?.a11y?.role === "string"
      ? selectedNode.value.a11y.role
      : undefined;

  if (currentValue === nextValue) {
    role.value = nextValue ?? "";
    return;
  }

  await saveAttributes(
    {
      a11y: {
        role: nextValue,
      },
    },
    () => {
      role.value = nextValue ?? "";
      showAdvanced.value = Boolean(nextValue) || showAdvanced.value;
    },
  );
}

async function resetAttributes(): Promise<void> {
  if (!selectedNodeId.value) return;
  if (!props.currentItemType || !props.currentItemSlug) return;

  await saveAttributes(
    {
      props: {
        element: undefined,
        id: undefined,
      },
      a11y: {
        ariaLabel: undefined,
        role: undefined,
      },
    },
    () => {
      tag.value = defaultTag.value;
      domId.value = "";
      ariaLabel.value = "";
      role.value = "";
      showAdvanced.value = false;
    },
  );
}
</script>

<template>
  <BaseProperty
    :open="open"
    :defaultOpen="defaultOpen"
    :has-changes="hasAttributeChanges"
    :show-reset="hasAttributeChanges"
    :reset-disabled="isPanelDisabled"
    :reset-aria-label="t('inspector.attributes.reset')"
    @update:open="emit('update:open', $event)"
    @reset="void resetAttributes()"
    title="Attributes"
  >
    <div class="space-y-4">
      <div class="space-y-1">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.attributes.tag") }}</label>
          <Select
            :model-value="tag"
            @update:model-value="
              (value) => {
                void updateTag(value);
              }
            "
          >
            <SelectTrigger class="h-8 w-full" :disabled="isPanelDisabled">
              <SelectValue :placeholder="t('inspector.attributes.selectTag')" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem
                  v-for="option in htmlTagOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  &lt;{{ option.label }}&gt;
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <p :class="PROPERTY_HINT_CLASS">
          {{ t("inspector.attributes.tagHint") }}
        </p>
      </div>

      <div class="space-y-1">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.attributes.id") }}</label>
          <Input
            :value="domId"
            placeholder="hero-section"
            class="inspector-input"
            :disabled="isPanelDisabled"
            @input="domId = ($event.target as HTMLInputElement).value"
            @blur="() => void saveDomId()"
          />
        </div>
        <p :class="PROPERTY_HINT_CLASS">
          {{ t("inspector.attributes.idHint") }}
        </p>
        <p v-if="duplicateDomIdWarning" class="text-xs text-amber-600">
          {{ duplicateDomIdWarning }}
        </p>
      </div>

      <div class="space-y-1">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.attributes.ariaLabel") }}</label>
          <Input
            :value="ariaLabel"
            :placeholder="t('inspector.attributes.ariaLabelPlaceholder')"
            class="inspector-input"
            :disabled="isPanelDisabled"
            @input="ariaLabel = ($event.target as HTMLInputElement).value"
            @blur="() => void saveAriaLabel()"
          />
        </div>
        <p :class="PROPERTY_HINT_CLASS">
          {{ t("inspector.attributes.ariaLabelHint") }}
        </p>
      </div>

      <div class="space-y-1">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.attributes.role") }}</label>
          <Input
            :value="role"
            placeholder="banner"
            class="inspector-input"
            :disabled="isPanelDisabled"
            @input="role = ($event.target as HTMLInputElement).value"
            @blur="() => void saveRole()"
          />
        </div>
        <p :class="PROPERTY_HINT_CLASS">
          {{ t("inspector.attributes.roleHint") }}
        </p>
      </div>

      <p v-if="validationError" class="text-xs text-red-500">
        {{ validationError }}
      </p>

      <p v-if="error" class="text-xs text-red-500">
        {{ error }}
      </p>
    </div>
  </BaseProperty>
</template>
