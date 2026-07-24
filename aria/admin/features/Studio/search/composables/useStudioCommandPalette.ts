import { computed, type ComputedRef, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppearance } from "@/features/Design";
import { useSettingsDialog } from "@/features/Studio/settings";
import { useStudioRouter } from "@/features/Studio/core/composables";
import { useCreateComponentDialog } from "@/features/Studio/components/composables/useCreateComponentDialog";
import { useCreatePageDialog } from "@/features/Studio/pages/composables/useCreatePageDialog";
import { useAppRouter } from "@/features/Core";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { useStudioI18n } from "@/i18n";
import { setCmsEntryNavigationPreview } from "@/features/CMS/lib/cmsNavigationPreview";
import { buildAppearancePaletteItems } from "../schemas/appearancePaletteItems";
import { isFeatureEnabled } from "../../../../../lib/features";
import type {
  CommandPaletteComponentItem,
  CommandPaletteCmsEntryItem,
  CommandPaletteCmsCollectionItem,
  CommandPaletteItem,
  CommandPaletteLayoutItem,
  CommandPalettePageItem,
} from "../schemas/commandPalette";

export interface UseStudioCommandPaletteOptions {
  pages: Ref<readonly CommandPalettePageItem[]>;
  layouts: Ref<readonly CommandPaletteLayoutItem[]>;
  components: Ref<readonly CommandPaletteComponentItem[]>;
  cmsEntries?: Ref<readonly CommandPaletteCmsEntryItem[]>;
  cmsCollections?: Ref<readonly CommandPaletteCmsCollectionItem[]>;
  isLoading: Ref<boolean>;
  searchQuery: Ref<string>;
  close: () => void;
}

export interface UseStudioCommandPaletteReturn {
  defaultItems: ComputedRef<CommandPaletteItem[]>;
  groupedItems: ComputedRef<Record<string, CommandPaletteItem[]>>;
  isLoading: ComputedRef<boolean>;
}

export function useStudioCommandPalette(
  options: UseStudioCommandPaletteOptions,
): UseStudioCommandPaletteReturn {
  const route = useRoute();
  const router = useRouter();
  const studioRouter = useStudioRouter();
  const createComponentDialog = useCreateComponentDialog();
  const appRouter = useAppRouter();
  const caps = useStudioCapabilities();
  const settingsDialog = useSettingsDialog();
  const createPageDialog = useCreatePageDialog();
  const { t } = useStudioI18n();
  const {
    settings,
    updateAppearance,
    isLoading: isAppearanceLoading,
  } = useAppearance();

  const isInComposer = computed(() => "composer" in route.query);

  function closePalette(): void {
    options.close();
    options.searchQuery.value = "";
  }

  const defaultItems = computed<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [
      {
        id: "nav-dashboard",
        label: t("commandSearch.dashboard"),
        category: t("commandSearch.category.quickNavigation"),
        icon: "i-hugeicons:home-02",
        keywords: "Dashboard",
        action: () => {
          studioRouter.navigateTo("dashboard");
          closePalette();
        },
      },
      {
        id: "nav-pages",
        label: t("commandSearch.viewPages"),
        category: t("commandSearch.category.quickNavigation"),
        icon: "i-hugeicons:file-01",
        keywords: "View Pages",
        action: () => {
          studioRouter.navigateTo("pages");
          closePalette();
        },
      },
      ...(isFeatureEnabled("studio.layouts")
        ? [
            {
              id: "nav-layouts",
              label: t("commandSearch.viewLayouts"),
              category: t("commandSearch.category.quickNavigation"),
              icon: "i-hugeicons:browser",
              keywords: "View Layouts",
              action: () => {
                studioRouter.navigateTo("layouts");
                closePalette();
              },
            } satisfies CommandPaletteItem,
          ]
        : []),
      {
        id: "nav-components",
        label: t("commandSearch.viewComponents"),
        category: t("commandSearch.category.quickNavigation"),
        icon: "i-hugeicons:component",
        keywords: "View Components",
        action: () => {
          studioRouter.navigateTo("components");
          closePalette();
        },
      },
      {
        id: "nav-design",
        label: t("commandSearch.designSystem"),
        category: t("commandSearch.category.designSettings"),
        icon: "i-hugeicons:colors",
        keywords: "Design System",
        action: () => {
          studioRouter.navigateTo("/design?colors");
          closePalette();
        },
      },
      {
        id: "nav-settings",
        label: t("commandSearch.siteSettings"),
        category: t("commandSearch.category.designSettings"),
        icon: "i-hugeicons:settings-01",
        keywords: "Site Settings",
        action: () => {
          settingsDialog.open();
          closePalette();
        },
      },
    ];

    return items;
  });

  const allItems = computed<CommandPaletteItem[]>(() => {
    const items: CommandPaletteItem[] = [...defaultItems.value];

    if (isInComposer.value) {
      items.push({
        id: "nav-layers",
        label: t("commandSearch.goToLayers"),
        category: t("commandSearch.category.navigation"),
        icon: "i-hugeicons:group-layers",
        keywords: "Go to Layers",
        action: () => {
          appRouter.setEditingTab("layers");
          closePalette();
        },
      });
    }

    items.push(
      {
        id: "nav-collections",
        label: t("commandSearch.goToCollections"),
        category: t("commandSearch.category.navigation"),
        icon: "i-hugeicons:database-01",
        keywords: "Go to Collections",
        action: () => {
          studioRouter.navigateTo("collections");
          closePalette();
        },
      },
      {
        id: "nav-media",
        label: t("commandSearch.goToMedia"),
        category: t("commandSearch.category.navigation"),
        icon: "i-hugeicons:album-01",
        keywords: "Go to Media",
        action: () => {
          studioRouter.navigateTo("media");
          closePalette();
        },
      },
    );

    if (caps.canCreatePage.value) {
      const createItems: CommandPaletteItem[] = [
        {
          id: "create-page",
          label: t("commandSearch.createPage"),
          category: t("commandSearch.category.create"),
          icon: "i-hugeicons:add-circle",
          keywords: "Create New Page",
          action: () => {
            closePalette();
            if (route.path !== "/pages") {
              studioRouter.navigateTo("pages");
            }
            createPageDialog.open();
          },
        },
        {
          id: "create-component",
          label: t("commandSearch.createComponent"),
          category: t("commandSearch.category.create"),
          icon: "i-hugeicons:add-circle",
          keywords: "Create New Component",
          action: () => {
            closePalette();
            createComponentDialog.open();
          },
        },
      ];

      if (isFeatureEnabled("studio.layouts")) {
        createItems.splice(1, 0, {
          id: "create-layout",
          label: t("commandSearch.createLayout"),
          category: t("commandSearch.category.create"),
          icon: "i-hugeicons:add-circle",
          keywords: "Create New Layout",
          action: () => {
            studioRouter.navigateTo("/layouts/new");
            closePalette();
          },
        });
      }

      items.push(...createItems);
    }

    items.push(
      ...buildAppearancePaletteItems({
        current: {
          themeId: settings.value.themeId,
          colorScheme: settings.value.colorScheme,
        },
        isReady: !isAppearanceLoading.value,
        onSetTheme: (themeId) => {
          void updateAppearance({ themeId }, { animate: true });
        },
        onSetColorScheme: (colorScheme) => {
          void updateAppearance({ colorScheme }, { animate: true });
        },
        onOpenSettings: () => {
          settingsDialog.open("appearance");
        },
        onClose: closePalette,
        t,
      }),
    );

    for (const page of options.pages.value) {
      if (isInComposer.value) {
        if (caps.canEditItemInComposer("page")) {
          items.push({
            id: `switch-page-${page.slug}`,
            label: t("commandSearch.switchTo", { item: page.title }),
            description: page.slug,
            category: t("commandSearch.category.pages"),
            icon: "i-hugeicons:file-01",
            keywords: `Switch ${page.title} ${page.slug}`,
            action: () => {
              studioRouter.startEditing("page", page.slug);
              closePalette();
            },
          });
        }
        continue;
      }

      if (!caps.isContributor.value) {
        items.push({
          id: `open-page-${page.slug}`,
          label: t("commandSearch.open", { item: page.title }),
          description: page.slug,
          category: t("commandSearch.category.pages"),
          icon: "i-hugeicons:file-01",
          keywords: `${page.title} ${page.slug}`,
          action: () => {
            studioRouter.navigateTo(`/pages/${page.slug}`);
            closePalette();
          },
        });
      }

      if (caps.canEditItemInComposer("page")) {
        items.push({
          id: `edit-page-${page.slug}`,
          label: t("commandSearch.editInComposer", { item: page.title }),
          description: page.slug,
          category: t("commandSearch.category.pages"),
          icon: "i-hugeicons:edit-03",
          keywords: `Edit ${page.title} ${page.slug} composer`,
          action: () => {
            studioRouter.startEditing("page", page.slug);
            closePalette();
          },
        });
      }
    }

    if (isFeatureEnabled("studio.layouts")) {
      for (const layout of options.layouts.value) {
        if (isInComposer.value) {
          if (caps.canEditItemInComposer("layout")) {
            items.push({
              id: `switch-layout-${layout.slug}`,
              label: t("commandSearch.switchTo", {
                item: layout.title ?? layout.name,
              }),
              description: layout.description ?? layout.slug,
              category: t("commandSearch.category.layouts"),
              icon: "i-hugeicons:browser",
              keywords: `Switch ${layout.title ?? layout.name} ${layout.name} ${layout.slug}`,
              action: () => {
                studioRouter.startEditing("layout", layout.slug);
                closePalette();
              },
            });
          }
          continue;
        }

        if (!caps.isContributor.value) {
          items.push({
            id: `open-layout-${layout.slug}`,
            label: t("commandSearch.open", {
              item: layout.title ?? layout.name,
            }),
            description: layout.description ?? layout.slug,
            category: t("commandSearch.category.layouts"),
            icon: "i-hugeicons:browser",
            keywords: `${layout.title ?? layout.name} ${layout.name} ${layout.slug}`,
            action: () => {
              studioRouter.navigateTo(`/layouts/${layout.slug}`);
              closePalette();
            },
          });
        }

        if (caps.canEditItemInComposer("layout")) {
          items.push({
            id: `edit-layout-${layout.slug}`,
            label: t("commandSearch.editInComposer", {
              item: layout.title ?? layout.name,
            }),
            description: layout.description ?? layout.slug,
            category: t("commandSearch.category.layouts"),
            icon: "i-hugeicons:edit-03",
            keywords: `Edit ${layout.title ?? layout.name} ${layout.name} composer`,
            action: () => {
              studioRouter.startEditing("layout", layout.slug);
              closePalette();
            },
          });
        }
      }
    }

    for (const component of options.components.value) {
      if (isInComposer.value) {
        if (caps.canEditItemInComposer("component")) {
          items.push({
            id: `switch-component-${component.slug}`,
            label: t("commandSearch.switchTo", { item: component.name }),
            description: component.description ?? component.slug,
            category: t("commandSearch.category.components"),
            icon: "i-hugeicons:component",
            keywords: `Switch ${component.name} ${component.slug}`,
            action: () => {
              studioRouter.startEditing("component", component.slug);
              closePalette();
            },
          });
        }
        continue;
      }

      if (!caps.isContributor.value) {
        items.push({
          id: `open-component-${component.slug}`,
          label: t("commandSearch.open", { item: component.name }),
          description: component.description ?? component.slug,
          category: t("commandSearch.category.components"),
          icon: "i-hugeicons:component",
          keywords: `${component.name} ${component.slug}`,
          action: () => {
            studioRouter.navigateTo(`/components/${component.slug}`);
            closePalette();
          },
        });
      }

      if (caps.canEditItemInComposer("component")) {
        items.push({
          id: `edit-component-${component.slug}`,
          label: t("commandSearch.editInComposer", { item: component.name }),
          description: component.description ?? component.slug,
          category: t("commandSearch.category.components"),
          icon: "i-hugeicons:edit-03",
          keywords: `Edit ${component.name} composer`,
          action: () => {
            studioRouter.startEditing("component", component.slug);
            closePalette();
          },
        });
      }
    }

    for (const entry of options.cmsEntries?.value ?? []) {
      items.push({
        id: `open-cms-entry-${entry.collectionName}-${entry.id}`,
        label: entry.title,
        description: `${entry.collectionLabel} / ${entry.slug}`,
        category: t("commandSearch.category.entries"),
        icon: "i-hugeicons:file-01",
        keywords: `${entry.title} ${entry.slug} ${entry.collectionLabel} ${entry.collectionName} ${entry.status}`,
        serverMatched: true,
        action: async () => {
          setCmsEntryNavigationPreview({
            id: entry.id,
            collectionId: entry.collectionId,
            collectionName: entry.collectionName,
            title: entry.title,
            slug: entry.slug,
            status: entry.status,
          });
          await router.push({
            name: "cms-entry-detail",
            params: {
              name: entry.collectionName,
              entrySlugOrId: entry.slug,
            },
            query: { locale: entry.locale },
          });
        },
      });
    }

    for (const collection of options.cmsCollections?.value ?? []) {
      items.push({
        id: `open-cms-collection-${collection.id}`,
        label: collection.label,
        description: collection.name,
        category: t("commandSearch.category.entries"),
        icon: "i-hugeicons:database-01",
        keywords: `${collection.label} ${collection.name}`,
        serverMatched: true,
        action: async () => {
          await router.push(`/collections/${collection.name}`);
        },
      });
    }

    if (options.isLoading.value) {
      items.push({
        id: "loading",
        label: t("commandSearch.loadingContent"),
        category: t("commandSearch.category.status"),
        icon: "i-hugeicons:refresh",
        keywords: "Loading",
        action: () => {},
      });
    }

    return items;
  });

  const groupedItems = computed<Record<string, CommandPaletteItem[]>>(() => {
    const groups: Record<string, CommandPaletteItem[]> = {};
    const itemsToShow = options.searchQuery.value.trim()
      ? allItems.value
      : defaultItems.value;

    for (const item of itemsToShow) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }

    return groups;
  });

  return {
    defaultItems,
    groupedItems,
    isLoading: computed(() => options.isLoading.value),
  };
}
