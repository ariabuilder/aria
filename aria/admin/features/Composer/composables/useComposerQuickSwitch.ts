import { computed, ref, type ComputedRef, type Ref } from "vue";
import { toast } from "vue-sonner";
import type { EditableItemType } from "@/features/Core/types/router";
import {
  parseQuickSwitchTarget,
  resolveQuickSwitchValue,
  SelectableCmsEntrySchema,
  SelectableComponentSchema,
  SelectableLayoutSchema,
  SelectablePageSchema,
  type QuickSwitchGroup,
  type CmsQuickSwitchTarget,
  type QuickSwitchTarget,
} from "../schemas/quickSwitch";
import { studioIcons } from "@/lib/icons";
import { useStudioI18n } from "@/i18n";
import { isFeatureEnabled } from "../../../../lib/features";

export interface UseComposerQuickSwitchOptions {
  availablePages: Ref<readonly unknown[]>;
  availableLayouts: Ref<readonly unknown[]>;
  availableComponents: Ref<readonly unknown[]>;
  availableCmsEntries?: Ref<readonly unknown[]>;
  currentItemSlug: Ref<string>;
  currentItemType: Ref<EditableItemType | undefined>;
  currentPageTitle: Ref<string | undefined>;
  currentLayoutName: Ref<string | undefined>;
  hasUnsavedChanges?: Ref<boolean>;
  ensureSaved?: () => Promise<boolean>;
  onSelectPage: (slug: string) => void;
  onSelectLayout: (slug: string) => void;
  onSelectComponent: (slug: string) => void;
  onSelectCmsEntry?: (target: CmsQuickSwitchTarget) => void | Promise<void>;
}

export interface UseComposerQuickSwitchReturn {
  isOpen: Ref<boolean>;
  open: () => void;
  close: () => void;
  groups: ComputedRef<QuickSwitchGroup[]>;
  hasOptions: ComputedRef<boolean>;
  currentValue: ComputedRef<string>;
  placeholder: ComputedRef<string>;
  editingLabel: ComputedRef<string>;
  editingIcon: ComputedRef<string>;
  handleSelect: (raw: unknown) => void | Promise<void>;
}

export function useComposerQuickSwitch(
  options: UseComposerQuickSwitchOptions,
): UseComposerQuickSwitchReturn {
  const { t } = useStudioI18n();
  const isOpen = ref(false);

  const parsedPages = computed(() => {
    const pages: ReturnType<typeof SelectablePageSchema.parse>[] = [];
    for (const raw of options.availablePages.value) {
      const parsed = SelectablePageSchema.safeParse(raw);
      if (parsed.success) {
        pages.push(parsed.data);
      }
    }
    return pages;
  });

  const parsedLayouts = computed(() => {
    const layouts: ReturnType<typeof SelectableLayoutSchema.parse>[] = [];
    for (const raw of options.availableLayouts.value) {
      const parsed = SelectableLayoutSchema.safeParse(raw);
      if (parsed.success) {
        layouts.push(parsed.data);
      }
    }
    return layouts;
  });

  const parsedComponents = computed(() => {
    const components: ReturnType<typeof SelectableComponentSchema.parse>[] =
      [];
    for (const raw of options.availableComponents.value) {
      const parsed = SelectableComponentSchema.safeParse(raw);
      if (parsed.success) {
        components.push(parsed.data);
      }
    }
    return components;
  });

  const parsedCmsEntries = computed(() => {
    const entries: ReturnType<typeof SelectableCmsEntrySchema.parse>[] = [];
    for (const raw of options.availableCmsEntries?.value ?? []) {
      const parsed = SelectableCmsEntrySchema.safeParse(raw);
      if (parsed.success) {
        entries.push(parsed.data);
      }
    }
    return entries;
  });

  const groups = computed<QuickSwitchGroup[]>(() => {
    const result: QuickSwitchGroup[] = [];

    const visiblePages = parsedPages.value.filter(
      (page) => page.status !== "archived",
    );
    if (visiblePages.length > 0) {
      result.push({
        label: t("pages.title"),
        options: visiblePages.map((page) => ({
          itemType: "page" as const,
          value: resolveQuickSwitchValue("page", page),
          label: page.title,
          meta: page.status === "published" ? undefined : page.status,
          icon: studioIcons.collections,
          keywords: [page.title, page.slug].filter(Boolean).join(" "),
        })),
      });
    }

    if (parsedComponents.value.length > 0) {
      result.push({
        label: t("components.title"),
        options: parsedComponents.value.map((component) => ({
          itemType: "component" as const,
          value: resolveQuickSwitchValue("component", component),
          label: component.name,
          meta: component.category,
          icon: studioIcons.component,
          keywords: [component.name, component.category, component.id]
            .filter(Boolean)
            .join(" "),
        })),
      });
    }

    if (
      isFeatureEnabled("studio.layouts") &&
      parsedLayouts.value.length > 0
    ) {
      result.push({
        label: t("commandSearch.category.layouts"),
        options: parsedLayouts.value.map((layout) => ({
          itemType: "layout" as const,
          value: resolveQuickSwitchValue("layout", layout),
          label: layout.title ?? layout.name,
          meta: layout.description,
          icon: studioIcons.layoutPivot,
          keywords: [layout.title ?? layout.name, layout.name, layout.id]
            .filter(Boolean)
            .join(" "),
        })),
      });
    }

    if (parsedCmsEntries.value.length > 0) {
      result.push({
        label: t("commandSearch.category.entries"),
        options: parsedCmsEntries.value.map((entry) => ({
          itemType: "cms-entry" as const,
          value: entry.id,
          label: entry.title,
          meta: entry.collectionLabel,
          icon: studioIcons.pages,
          keywords: [
            entry.title,
            entry.slug,
            entry.collectionLabel,
            entry.collectionName,
          ].join(" "),
          collectionId: entry.collectionId,
          collectionName: entry.collectionName,
          collectionLabel: entry.collectionLabel,
          slug: entry.slug,
          locale: entry.locale,
          status: entry.status,
        })),
      });
    }

    return result;
  });

  const hasOptions = computed(() => groups.value.length > 0);
  const currentValue = computed(() => options.currentItemSlug.value ?? "");

  const placeholder = computed(() => t("composer.switcher.placeholder"));

  const editingLabel = computed(() => {
    const itemType = options.currentItemType.value;
    if (!itemType || !options.currentItemSlug.value) {
      return "";
    }
    if (itemType === "page") {
      return (
        options.currentPageTitle.value ||
        options.currentItemSlug.value ||
        t("composer.switcher.untitledPage")
      );
    }
    if (itemType === "component") {
      return (
        options.currentItemSlug.value || t("composer.switcher.untitledComponent")
      );
    }
    if (itemType === "layout") {
      return (
        options.currentLayoutName.value ||
        options.currentItemSlug.value ||
        t("composer.switcher.untitledLayout")
      );
    }
    return options.currentItemSlug.value;
  });

  const editingIcon = computed(() => {
    const itemType = options.currentItemType.value;
    if (itemType === "page") return studioIcons.pages;
    if (itemType === "component") return studioIcons.component;
    if (itemType === "layout") return studioIcons.layoutPivot;
    return studioIcons.pages;
  });

  function open(): void {
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
  }

  function isCurrentSelection(target: QuickSwitchTarget): boolean {
    if (target.itemType === "cms-entry") {
      return false;
    }
    const itemType = options.currentItemType.value;
    if (!itemType || target.itemType !== itemType) {
      return false;
    }
    return target.itemId === currentValue.value;
  }

  async function dispatchSelection(target: QuickSwitchTarget): Promise<void> {
    if (target.itemType === "cms-entry") {
      await options.onSelectCmsEntry?.(target);
      return;
    }
    if (target.itemType === "page") {
      options.onSelectPage(target.itemId);
      return;
    }
    if (target.itemType === "layout") {
      if (!isFeatureEnabled("studio.layouts")) {
        return;
      }
      options.onSelectLayout(target.itemId);
      return;
    }
    options.onSelectComponent(target.itemId);
  }

  async function handleSelect(raw: unknown): Promise<void> {
    const target = parseQuickSwitchTarget(raw);
    if (!target) {
      return;
    }

    if (isCurrentSelection(target)) {
      close();
      return;
    }

    if (options.hasUnsavedChanges?.value) {
      if (options.ensureSaved) {
        const saved = await options.ensureSaved();
        if (!saved) {
          toast.error(t("composer.switcher.saveBeforeSwitchFailed"));
          return;
        }
      }

      // The shell owns the leave dialog. Dispatching lets its navigation
      // boundary ask before Composer state or the route is changed.
    }

    await dispatchSelection(target);
    close();
  }

  return {
    isOpen,
    open,
    close,
    groups,
    hasOptions,
    currentValue,
    placeholder,
    editingLabel,
    editingIcon,
    handleSelect,
  };
}
