<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import BaseProperty from "./BaseProperty.vue";
import { usePropertySave } from "../../Core";
import { useInspectorPanelControls } from "../composables/useInspectorPanelControls";
import {
  NavItemPropsSchema,
  parseNavItemProps,
} from "../../../../lib/blocks/navigationSchema";
import { useNodeMutations } from "../composables/useNodeMutations";
import type { NodeTarget } from "../types/inspector";
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

const PROPERTY_ROW_CLASS =
  "grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2";
const PROPERTY_LABEL_CLASS =
  "text-3xs font-semibold uppercase tracking-widest text-muted-foreground";
const SELECT_TRIGGER_CLASS =
  "h-9 border-dashed border-border-70 bg-sidebar text-xs hover:border-border hover:bg-sidebar-80 focus:ring-0 focus:ring-offset-0";
const SELECT_CONTENT_CLASS =
  "border-border-70 bg-sidebar text-foreground shadow-xl";
const SOURCE_MODE_TOGGLE_GROUP_CLASS =
  "grid grid-cols-2 gap-1 rounded-md border border-border-70 bg-sidebar p-1";
const SOURCE_MODE_TOGGLE_CLASS =
  "h-8 rounded-sm px-2 text-xs text-muted-foreground transition hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
const ACTIVE_SOURCE_MODE_TOGGLE_CLASS =
  "bg-secondary text-secondary-foreground shadow-sm";

const { selectedNode, selectedNodeId, saveNodeUpdates } = usePropertySave();
const { updateProperty } = useNodeMutations();
const internalOpen = ref(props.defaultOpen);

const sectionOpen = computed({
  get: () => props.open ?? internalOpen.value,
  set: (value: boolean) => {
    internalOpen.value = value;
    emit("update:open", value);
  },
});

function hasSaveContext(): boolean {
  return Boolean(
    selectedNodeId.value && props.currentItemType && props.currentItemSlug,
  );
}

const { isPanelDisabled } = useInspectorPanelControls({
  hasSaveContext,
  isLoading: computed(() => false),
});

const navItemProps = computed(() =>
  parseNavItemProps(selectedNode.value?.props ?? {}),
);
const linkChild = computed(
  () =>
    selectedNode.value?.children.find((child) =>
      ["link", "button"].includes(child.type.toLowerCase()),
    ) ?? null,
);
const linkBindings = computed(() => linkChild.value?.dataSource?.bindings ?? {});
const itemSourceMode = computed(() =>
  linkBindings.value.text || linkBindings.value.href ? "cms" : "static",
);

async function updateNavItemProps(
  patch: Partial<ReturnType<typeof parseNavItemProps>>,
  description: string,
) {
  const node = selectedNode.value;
  if (!node) {
    return { success: false as const, error: "No node selected" };
  }

  const nextProps = NavItemPropsSchema.parse({
    ...navItemProps.value,
    ...patch,
  });

  return saveNodeUpdates(
    { props: { ...node.props, ...nextProps } },
    props.currentItemType,
    props.currentItemSlug,
    node.id,
  );
}

function collectionName() {
  if (props.currentItemType === "page") return "pages" as const;
  if (props.currentItemType === "layout") return "layouts" as const;
  if (props.currentItemType === "component") return "components" as const;
  return null;
}

function buildLinkTarget(): NodeTarget | null {
  const link = linkChild.value;
  const collection = collectionName();
  if (!link || !collection || !props.currentItemSlug) {
    return null;
  }

  return {
    path: { collection, id: props.currentItemSlug },
    nodeId: link.id,
  };
}

async function updateLinkBindings(
  bindings: Record<string, string> | undefined,
  description: string,
) {
  const link = linkChild.value;
  if (!link) {
    return { success: false as const, error: "Nav item is missing a link" };
  }

  const nextDataSource =
    bindings && Object.keys(bindings).length > 0
      ? {
          ...(link.dataSource?.type === "static" ? link.dataSource : { type: "static" }),
          bindings,
        }
      : undefined;

  const target = buildLinkTarget();
  if (!target) {
    return { success: false as const, error: "Missing editor context" };
  }

  const result = await updateProperty(
    target,
    {
      path: "dataSource",
      value: nextDataSource,
      breakpoint: "base",
    },
    { description },
  );

  return result.success
    ? { success: true as const }
    : { success: false as const, error: result.error ?? "Update failed" };
}

async function setItemSourceMode(mode: "static" | "cms") {
  if (mode === "static") {
    return updateLinkBindings(undefined, "Set nav item source to static");
  }

  return updateLinkBindings(
    {
      text: linkBindings.value.text ?? "label",
      href: linkBindings.value.href ?? "link",
    },
    "Set nav item source to CMS",
  );
}

async function setBindingPath(propName: "text" | "href", fieldPath: string) {
  return updateLinkBindings(
    {
      ...linkBindings.value,
      [propName]: fieldPath,
    },
    `Set nav item ${propName} binding`,
  );
}
</script>

<template>
  <BaseProperty
    :open="sectionOpen"
    :defaultOpen="defaultOpen"
    title="Nav item"
    @update:open="sectionOpen = $event"
  >
    <div class="space-y-3">
      <div
        :class="SOURCE_MODE_TOGGLE_GROUP_CLASS"
        role="group"
        :aria-label="t('inspector.navItem.source')"
      >
        <button
          type="button"
          :aria-pressed="itemSourceMode === 'static'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            itemSourceMode === 'static' && ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          :disabled="isPanelDisabled || !linkChild"
          @click="void setItemSourceMode('static')"
        >
          {{ t("inspector.repeat.static") }}
        </button>
        <button
          type="button"
          :aria-pressed="itemSourceMode === 'cms'"
          :class="[
            SOURCE_MODE_TOGGLE_CLASS,
            itemSourceMode === 'cms' && ACTIVE_SOURCE_MODE_TOGGLE_CLASS,
          ]"
          :disabled="isPanelDisabled || !linkChild"
          @click="void setItemSourceMode('cms')"
        >
          CMS
        </button>
      </div>

      <template v-if="itemSourceMode === 'cms'">
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navItem.labelField") }}</label>
          <Input
            :model-value="linkBindings.text ?? 'label'"
            :disabled="isPanelDisabled || !linkChild"
            class="h-9 border-dashed border-border-70 bg-sidebar text-xs"
            @change="
              (event: Event) =>
                void setBindingPath(
                  'text',
                  (event.target as HTMLInputElement).value,
                )
            "
          />
        </div>
        <div :class="PROPERTY_ROW_CLASS">
          <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navItem.hrefField") }}</label>
          <Input
            :model-value="linkBindings.href ?? 'link'"
            :disabled="isPanelDisabled || !linkChild"
            class="h-9 border-dashed border-border-70 bg-sidebar text-xs"
            @change="
              (event: Event) =>
                void setBindingPath(
                  'href',
                  (event.target as HTMLInputElement).value,
                )
            "
          />
        </div>
      </template>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navigation.submenu") }}</label>
        <Select
          :model-value="navItemProps.submenuType"
          :disabled="isPanelDisabled"
          @update:model-value="
            (value) =>
              void updateNavItemProps(
                {
                  submenuType: value as 'none' | 'dropdown' | 'mega',
                },
                'Set nav item submenu type',
              )
          "
        >
          <SelectTrigger :class="SELECT_TRIGGER_CLASS">
            <SelectValue />
          </SelectTrigger>
          <SelectContent :class="SELECT_CONTENT_CLASS">
            <SelectItem value="none">{{ t("inspector.media.fit.none") }}</SelectItem>
            <SelectItem value="dropdown">{{ t("inspector.navItem.dropdown") }}</SelectItem>
            <SelectItem value="mega">Mega</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div :class="PROPERTY_ROW_CLASS">
        <label :class="PROPERTY_LABEL_CLASS">{{ t("inspector.navItem.show") }}</label>
        <Select
          :model-value="navItemProps.visibility"
          :disabled="isPanelDisabled"
          @update:model-value="
            (value) =>
              void updateNavItemProps(
                {
                  visibility: value as 'all' | 'desktop' | 'mobile',
                },
                'Set nav item visibility',
              )
          "
        >
          <SelectTrigger :class="SELECT_TRIGGER_CLASS">
            <SelectValue />
          </SelectTrigger>
          <SelectContent :class="SELECT_CONTENT_CLASS">
            <SelectItem value="all">{{ t("inspector.navItem.all") }}</SelectItem>
            <SelectItem value="desktop">{{ t("inspector.navItem.desktop") }}</SelectItem>
            <SelectItem value="mobile">{{ t("inspector.navigation.mobile") }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  </BaseProperty>
</template>
