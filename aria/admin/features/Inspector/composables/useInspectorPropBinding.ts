import { computed, type MaybeRefOrGetter, toValue } from "vue";
import {
  usePropsEditor,
  type PropBindingMode,
  type PropertyDefinition,
} from "./usePropsEditor";
import { STYLE_BINDING_BACKGROUND_IMAGE } from "../../../../lib/cms/styleBindings";
import {
  getCanonicalContentPropName,
  getContentValue,
} from "../../../../lib/blocks/contentContract";
import type { BuilderNode } from "../../../../lib/types/nodes";
import { usePropertySave } from "../../Core";

export { STYLE_BINDING_BACKGROUND_IMAGE };

export type InspectorBindingSourceMode = "static" | "collection";

export type BindingPickerMode = "fast-fields" | "multi-step";

export type InspectorBindingPickerPage = "collection" | "entry" | "field";

export function resolveBindingPickerMode(input: {
  isListTemplatePage: boolean;
  hasInheritedCmsLoopSource: boolean;
  isListLoopContainer?: boolean;
}): BindingPickerMode {
  if (input.hasInheritedCmsLoopSource) {
    return "fast-fields";
  }
  if (input.isListLoopContainer) {
    return "fast-fields";
  }
  if (input.isListTemplatePage) {
    return "multi-step";
  }
  return "fast-fields";
}

export function resolveInspectorBindingPickerInitialPage(input: {
  hasSelectedCollection: boolean;
  hasSelectedEntry: boolean;
}): InspectorBindingPickerPage {
  if (!input.hasSelectedCollection) {
    return "collection";
  }
  if (!input.hasSelectedEntry) {
    return "entry";
  }
  return "field";
}

export interface UseInspectorPropBindingOptions {
  propName: MaybeRefOrGetter<string>;
  propType?: MaybeRefOrGetter<PropertyDefinition["type"]>;
  value?: MaybeRefOrGetter<unknown>;
}

export function resolveTextBindingPropName(
  node: BuilderNode | null | undefined,
): string {
  return getCanonicalContentPropName(node?.type) ?? "text";
}

export function buildInspectorPropertyDefinition(input: {
  name: string;
  type?: PropertyDefinition["type"];
  value?: unknown;
}): PropertyDefinition {
  return {
    name: input.name,
    type: input.type ?? "string",
    value: input.value ?? "",
    isRequired: false,
    studioEditable: true,
    studioHidden: false,
    hasSchemaField: false,
    contentEditorEligible: false,
    contentEditorEnabled: false,
    contentEditorLocked: false,
    contentEditorHidden: false,
  };
}

export function useInspectorPropBinding(
  options: UseInspectorPropBindingOptions,
) {
  const propsEditor = usePropsEditor();
  const { selectedNode } = usePropertySave();

  const propName = computed(() => toValue(options.propName));
  const propDefinition = computed(() =>
    buildInspectorPropertyDefinition({
      name: propName.value,
      type: toValue(options.propType) ?? "string",
      value: toValue(options.value),
    }),
  );

  const hasCmsContext = computed(
    () =>
      propsEditor.collections.value.length > 0 ||
      propsEditor.isAssignedCmsTemplatePage.value ||
      Boolean(
        propsEditor.selectedCollection.value ??
        propsEditor.pageAssignedCollection.value,
      ),
  );

  const boundPath = computed(
    () => propsEditor.cmsBindings.value[propName.value] ?? "",
  );
  const isBound = computed(() => propsEditor.isPropCmsBound(propName.value));
  const bindingMode = computed(() =>
    propsEditor.propBindingMode(propName.value),
  );
  const isCollectionMode = computed(
    () => bindingMode.value === "dynamic" || isBound.value,
  );
  const isReadOnly = computed(
    () =>
      propsEditor.isAssignedCmsTemplatePage.value &&
      propsEditor.isPropCmsBound(propName.value),
  );

  const fieldGroups = computed(() =>
    propsEditor.cmsFieldOptionGroupsForProp(propDefinition.value),
  );

  const displayLabel = computed(() => {
    const display = propsEditor.cmsBindingDisplayForProp(propName.value);
    return display?.label.replace(" → ", " · ") ?? "";
  });

  const bindingPickerMode = computed(() =>
    resolveBindingPickerMode({
      isListTemplatePage: propsEditor.isListTemplatePage.value,
      hasInheritedCmsLoopSource: propsEditor.hasInheritedCmsLoopSource.value,
      isListLoopContainer:
        propsEditor.isSelectedNodeRepeatCapable.value &&
        propsEditor.cmsDataSourceMode.value === "list",
    }),
  );

  const showFieldPicker = computed(() => {
    if (bindingPickerMode.value === "multi-step") {
      return !isRepeatItemsProp(propName.value);
    }
    if (propsEditor.isAssignedCmsTemplatePage.value) {
      return !isRepeatItemsProp(propName.value);
    }
    return isCollectionMode.value;
  });

  const showStaticCollectionToggle = computed(
    () =>
      hasCmsContext.value &&
      !propsEditor.isAssignedCmsTemplatePage.value &&
      !propsEditor.hasInheritedCmsLoopSource.value,
  );

  const usesInheritedLoopSource = computed(
    () => propsEditor.hasInheritedCmsLoopSource.value && isCollectionMode.value,
  );

  const pickerDisabled = computed(() => {
    if (bindingPickerMode.value === "multi-step") {
      return propsEditor.isLoadingCollections.value;
    }
    return (
      !propsEditor.selectedCollection.value &&
      !propsEditor.isAssignedCmsTemplatePage.value &&
      !propsEditor.hasInheritedCmsLoopSource.value
    );
  });

  function isRepeatItemsProp(name: string): boolean {
    return name === "items";
  }

  async function bind(fieldPath: string) {
    if (propsEditor.isEntryTemplatePage.value) {
      const result = await propsEditor.ensureTemplatePageDataSource();
      if (!result.success) {
        return result;
      }
    }
    return propsEditor.bindPropToCmsField(propName.value, fieldPath);
  }

  async function clear() {
    return propsEditor.unbindPropFromCms(propName.value);
  }

  async function setBindingMode(mode: PropBindingMode) {
    return propsEditor.setPropBindingMode(propName.value, mode);
  }

  async function enterCollectionMode() {
    return setBindingMode("dynamic");
  }

  async function leaveCollectionMode() {
    if (isBound.value) {
      await clear();
    }
    return setBindingMode("static");
  }

  return {
    propsEditor,
    selectedNode,
    propName,
    propDefinition,
    hasCmsContext,
    boundPath,
    isBound,
    bindingMode,
    isCollectionMode,
    isReadOnly,
    fieldGroups,
    displayLabel,
    bindingPickerMode,
    showFieldPicker,
    showStaticCollectionToggle,
    usesInheritedLoopSource,
    pickerDisabled,
    bind,
    clear,
    setBindingMode,
    enterCollectionMode,
    leaveCollectionMode,
  };
}

export function resolveImageBindingSourceMode(input: {
  isBound: boolean;
  src: string;
  isExternalUrl: boolean;
}): "media" | "url" | "collection" {
  if (input.isBound) {
    return "collection";
  }
  if (input.isExternalUrl && input.src.trim()) {
    return "url";
  }
  return "media";
}

export function resolveTextBindingSourceMode(input: {
  isBound: boolean;
  isCollectionPending: boolean;
}): InspectorBindingSourceMode {
  return input.isBound || input.isCollectionPending ? "collection" : "static";
}

export function resolveTextContentForBinding(
  node: BuilderNode | null | undefined,
): string {
  return getContentValue(node);
}
