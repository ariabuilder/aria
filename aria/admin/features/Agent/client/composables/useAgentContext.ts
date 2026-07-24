import {
  computed,
  inject,
  ref,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { useRoute } from "vue-router";
import type { AgentShellContext } from "../../lib/schemas";
import { parseComposerRouteTarget } from "@/lib/router/composerRouteTarget";
import { useStudioCapabilities } from "@/composables/useStudioCapabilities";
import { APP_INJECTION_KEYS } from "@/features/Core/types/injectionKeys";
import { useBeacon } from "@/features/Beacon";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../../lib/types/nodes";
import { findNodeById } from "../../../../../lib/blocks/nodeUtils";
import { useSiteSettings } from "@/composables/useSiteSettings";
import type { UseActiveLayoutSlotReturn } from "@/features/Core/composables/useActiveLayoutSlot";

const EMPTY_CONTEXT: AgentShellContext = {
  mode: "studio",
  workspace: "studio",
  itemType: null,
  itemSlug: null,
  itemTitle: null,
  pageId: null,
  selectedBlockId: null,
  blockCount: 0,
  canClientInsert: false,
  canClientNavigate: false,
};

type PageBlocksValue = { value: BuilderNode[] };

export function useAgentContextRef(): ComputedRef<AgentShellContext> {
  const route = useRoute();
  const caps = useStudioCapabilities();
  const injectedPageBlocks = inject(
    APP_INJECTION_KEYS.pageBlocks as InjectionKey<unknown>,
    null,
  ) as PageBlocksValue | null;
  const pageBlocks = injectedPageBlocks ?? (ref([]) as PageBlocksValue);
  const { focusedNodeId } = useBeacon();
  const { generalSettings } = useSiteSettings();
  const currentPage = inject<Ref<PageDSL | null>>(
    APP_INJECTION_KEYS.currentPage,
    ref(null),
  );
  const currentLayout = inject<Ref<LayoutDSL | null>>(
    APP_INJECTION_KEYS.currentLayout,
    ref(null),
  );
  const currentComponent = inject<Ref<ComponentDSL | null>>(
    APP_INJECTION_KEYS.currentComponent,
    ref(null),
  );
  const currentItemType = inject<Ref<"page" | "layout" | "component">>(
    APP_INJECTION_KEYS.currentItemType,
    ref("page"),
  );
  const hasUnsavedChanges = inject<Ref<boolean>>(
    APP_INJECTION_KEYS.hasUnsavedChanges,
    ref(false),
  );
  const activeLayoutSlot = inject<UseActiveLayoutSlotReturn | null>(
    APP_INJECTION_KEYS.activeLayoutSlot,
    null,
  );

  return computed<AgentShellContext>(() => {
    const composerTarget = parseComposerRouteTarget(route.path, route.query);
    const mode = composerTarget ? "composer" : "studio";
    const workspace = route.path.startsWith("/design")
      ? "design"
      : route.path.startsWith("/collections")
        ? "collections"
      : composerTarget
        ? "composer"
        : "studio";

    const itemType = composerTarget?.itemType ?? currentItemType.value;
    const itemSlug = composerTarget?.itemSlug ?? currentPage.value?.slug ?? null;
    const itemTitle = currentPage.value?.title ?? itemSlug;
    const blockCount = Array.isArray(pageBlocks.value) ? pageBlocks.value.length : 0;
    const rootTypes = Array.isArray(pageBlocks.value)
      ? pageBlocks.value.slice(0, 12).map((node) => node.type)
      : [];
    const selectedNode =
      focusedNodeId.value && Array.isArray(pageBlocks.value)
        ? findNodeById(pageBlocks.value, focusedNodeId.value)
        : null;

    const canClientInsert = Boolean(
      composerTarget &&
        itemType &&
        caps.isReady.value &&
        caps.canEditItemInComposer(itemType),
    );

    const canClientNavigate = Boolean(
      caps.isReady.value &&
        (caps.canEditItemInComposer("page") ||
          caps.canEditItemInComposer("layout") ||
          caps.canEditItemInComposer("component")),
    );

    return {
      mode,
      workspace,
      itemType: itemType ?? null,
      itemSlug,
      itemTitle,
      pageId: currentPage.value?.id ?? null,
      selectedBlockId: focusedNodeId.value,
      blockCount,
      canClientInsert,
      canClientNavigate,
      selectedBlock: selectedNode
        ? {
            id: selectedNode.id,
            type: selectedNode.type,
            label: summarizeNodeLabel(selectedNode),
          }
        : undefined,
      documentOutline: {
        rootBlockCount: blockCount,
        rootTypes,
      },
      routeContext: {
        path: route.path,
        name: typeof route.name === "string" ? route.name : undefined,
        section:
          typeof route.meta?.section === "string"
            ? route.meta.section
            : undefined,
      },
      siteContext: {
        siteName: generalSettings.value.siteName || undefined,
        siteUrl: generalSettings.value.siteUrl || undefined,
      },
      currentDocument: buildCurrentDocumentContext({
        itemType,
        itemSlug,
        currentPage: currentPage.value,
        currentLayout: currentLayout.value,
        currentComponent: currentComponent.value,
        pageBlocks: pageBlocks.value,
        hasUnsavedChanges: hasUnsavedChanges.value,
        activeLayoutSlot,
      }),
    };
  });
}

export function useAgentContext(): AgentShellContext {
  return useAgentContextRef().value;
}

export function getEmptyAgentShellContext(): AgentShellContext {
  return { ...EMPTY_CONTEXT };
}

function summarizeNodeLabel(node: BuilderNode): string | undefined {
  const props = node.props ?? {};
  const candidates = [props.text, props.content, props.label, props.alt];
  const value = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function buildCurrentDocumentContext(input: {
  itemType: "page" | "layout" | "component" | null;
  itemSlug: string | null;
  currentPage: PageDSL | null;
  currentLayout: LayoutDSL | null;
  currentComponent: ComponentDSL | null;
  pageBlocks: BuilderNode[];
  hasUnsavedChanges: boolean;
  activeLayoutSlot: UseActiveLayoutSlotReturn | null;
}): AgentShellContext["currentDocument"] {
  if (input.itemType === "page" && input.currentPage) {
    const page = input.currentPage;
    return {
      type: "page",
      id: page.id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      layout: page.layout,
      status: page.status,
      systemRole: page.systemRole,
      publicPath: page.slug === "index" ? "/" : `/${page.slug}`,
      isDirty: input.hasUnsavedChanges,
      activeSlot: summarizeActiveSlot(input.activeLayoutSlot),
      seo: page.settings?.seo
        ? {
            title: page.settings.seo.title,
            description: page.settings.seo.description,
            canonical: page.settings.seo.canonical,
            ogTitle: page.settings.seo.ogTitle,
            ogDescription: page.settings.seo.ogDescription,
            ogImage: page.settings.seo.ogImage,
            noindex: page.settings.seo.noindex,
            nofollow: page.settings.seo.nofollow,
          }
        : undefined,
      contentExcerpt: summarizeNodeText(input.pageBlocks),
    };
  }

  if (input.itemType === "layout" && input.currentLayout) {
    const layout = input.currentLayout;
    return {
      type: "layout",
      id: layout.id,
      slug: layout.slug ?? layout.id,
      title: layout.name ?? layout.id,
      description: layout.layoutMetadata?.description,
      isDirty: input.hasUnsavedChanges,
      activeSlot: summarizeActiveSlot(input.activeLayoutSlot),
      contentExcerpt: summarizeNodeText(input.pageBlocks),
    };
  }

  if (input.itemType === "component" && input.currentComponent) {
    const component = input.currentComponent;
    return {
      type: "component",
      id: component.id,
      slug: component.id,
      title: component.name ?? component.id,
      description: component.description,
      isDirty: input.hasUnsavedChanges,
      contentExcerpt: summarizeNodeText(input.pageBlocks),
    };
  }

  if (input.itemType && input.itemSlug) {
    return {
      type: input.itemType,
      id: input.itemSlug,
      slug: input.itemSlug,
      isDirty: input.hasUnsavedChanges,
      activeSlot: summarizeActiveSlot(input.activeLayoutSlot),
      contentExcerpt: summarizeNodeText(input.pageBlocks),
    };
  }

  return undefined;
}

function summarizeActiveSlot(
  activeLayoutSlot: UseActiveLayoutSlotReturn | null,
): NonNullable<AgentShellContext["currentDocument"]>["activeSlot"] {
  if (!activeLayoutSlot?.activeSlot?.value) {
    return undefined;
  }

  const activeSlot = activeLayoutSlot.activeSlot.value;
  return {
    name: activeSlot.name,
    label: activeLayoutSlot.activeSlotLabel?.value,
    scope: activeLayoutSlot.isLayoutSlotEditing.value ? "layout" : "page",
  };
}

function summarizeNodeText(nodes: readonly BuilderNode[]): string | undefined {
  const parts: string[] = [];
  collectNodeText(nodes, parts);
  const text = parts.join(" ").replace(/\s+/gu, " ").trim();
  if (!text) {
    return undefined;
  }
  return text.length > 600 ? `${text.slice(0, 597)}...` : text;
}

function collectNodeText(nodes: readonly BuilderNode[], parts: string[]): void {
  for (const node of nodes) {
    const label = summarizeNodeLabel(node);
    if (label) {
      parts.push(label);
    }
    if (parts.join(" ").length > 700) {
      return;
    }
    if (Array.isArray(node.children)) {
      collectNodeText(node.children, parts);
    }
  }
}
