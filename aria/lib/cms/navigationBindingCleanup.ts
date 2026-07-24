import { z } from "zod";
import { NodeDataSourceSchema, PageDSLSchema } from "../schemas/nodes";
import type { BuilderNode, NodeDataSource, PageDSL } from "../types/nodes";
import type {
  AuthorshipSaveContext,
  StorageAdapter,
} from "../storage/adapter";
import { MAIN_NAV_COLLECTION_NAME } from "../storage/starterMainNav";
import { DEFAULT_NAVIGATION_PROPS } from "../blocks/navigationSchema";

const ParsedNodeDataSourceSchema = NodeDataSourceSchema.unwrap();

export const NavigationBindingCleanupPageSchema = z
  .object({
    pageId: z.string().trim().min(1),
    pageSlug: z.string().trim().min(1),
    pageTitle: z.string().trim().min(1).optional(),
    cleanedNavigationNodeCount: z.int().nonnegative(),
  })
  .strict();

export const NavigationBindingCleanupResultSchema = z
  .object({
    cleanedNavigationNodeCount: z.int().nonnegative(),
    updatedPageIds: z.array(z.string().trim().min(1)),
    updatedPageSlugs: z.array(z.string().trim().min(1)),
    affectedPages: z.array(NavigationBindingCleanupPageSchema),
  })
  .strict();

export type NavigationBindingCleanupResult = z.infer<
  typeof NavigationBindingCleanupResultSchema
>;

type NodeCleanupResult = {
  node: BuilderNode;
  cleanedNavigationNodeCount: number;
};

function normalizedNodeType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function storedNavigationSourceMode(
  props: Record<string, unknown>,
): string | undefined {
  const sourceMode = props.sourceMode;
  return typeof sourceMode === "string" ? sourceMode : undefined;
}

function isCmsNavItemsNode(child: BuilderNode): boolean {
  return (
    normalizedNodeType(child.type) === "nav-items" &&
    child.dataSource?.source === "field" &&
    child.dataSource.mode === "list"
  );
}

function shouldStripNavigationBinding(input: {
  props: Record<string, unknown>;
  dataSource: NodeDataSource | undefined;
}): boolean {
  if (!input.dataSource) {
    return false;
  }

  const sourceMode = storedNavigationSourceMode(input.props);
  if (sourceMode !== "cms" && sourceMode !== "mixed") {
    return true;
  }

  const parsed = ParsedNodeDataSourceSchema.safeParse(input.dataSource);
  if (!parsed.success) {
    return true;
  }

  return parsed.data.collection === MAIN_NAV_COLLECTION_NAME;
}

function cleanupNavigationNode(node: BuilderNode): NodeCleanupResult {
  if (normalizedNodeType(node.type) !== "navigation") {
    return { node, cleanedNavigationNodeCount: 0 };
  }

  const props =
    typeof node.props === "object" && node.props !== null
      ? (node.props as Record<string, unknown>)
      : {};

  if (!shouldStripNavigationBinding({ props, dataSource: node.dataSource })) {
    return { node, cleanedNavigationNodeCount: 0 };
  }

  const nextChildren = node.children.filter((child) => !isCmsNavItemsNode(child));
  const { dataSource: _removed, ...rest } = node;

  return {
    node: {
      ...rest,
      props: {
        ...DEFAULT_NAVIGATION_PROPS,
        ...props,
        sourceMode: "static",
      },
      children: nextChildren,
    },
    cleanedNavigationNodeCount: 1,
  };
}

function cleanupNodes(nodes: readonly BuilderNode[]): {
  nodes: BuilderNode[];
  cleanedNavigationNodeCount: number;
} {
  let cleanedNavigationNodeCount = 0;
  const nextNodes = nodes.map((node) => {
    const direct = cleanupNavigationNode(node);
    cleanedNavigationNodeCount += direct.cleanedNavigationNodeCount;

    if (direct.node.children.length === 0) {
      return direct.node;
    }

    const childResult = cleanupNodes(direct.node.children);
    cleanedNavigationNodeCount += childResult.cleanedNavigationNodeCount;
    return {
      ...direct.node,
      children: childResult.nodes,
    };
  });

  return { nodes: nextNodes, cleanedNavigationNodeCount };
}

export function cleanupOrphanedNavigationBindingsInPage(
  page: PageDSL,
): { page: PageDSL; cleanedNavigationNodeCount: number } {
  const result = cleanupNodes(page.nodes);
  if (result.cleanedNavigationNodeCount === 0) {
    return { page, cleanedNavigationNodeCount: 0 };
  }

  return {
    page: PageDSLSchema.parse({
      ...page,
      nodes: result.nodes,
    }),
    cleanedNavigationNodeCount: result.cleanedNavigationNodeCount,
  };
}

async function listFullPageDsls(adapter: StorageAdapter): Promise<PageDSL[]> {
  const pages = await adapter.listPagesDSL({ limit: 1000, offset: 0 });
  const fullPages = await Promise.all(
    pages.map((page) => adapter.getPageDSL(page.id)),
  );
  return fullPages.filter((page): page is PageDSL => page !== null);
}

export async function cleanupOrphanedNavigationBindingsOnAdapter(
  adapter: StorageAdapter,
  authorship?: AuthorshipSaveContext,
): Promise<NavigationBindingCleanupResult> {
  const pages = await listFullPageDsls(adapter);
  const affectedPages: z.infer<typeof NavigationBindingCleanupPageSchema>[] = [];

  for (const page of pages) {
    const result = cleanupOrphanedNavigationBindingsInPage(page);
    if (result.cleanedNavigationNodeCount === 0) {
      continue;
    }

    await adapter.savePageDSL(
      result.page.id,
      result.page,
      undefined,
      authorship,
    );
    affectedPages.push(
      NavigationBindingCleanupPageSchema.parse({
        pageId: result.page.id,
        pageSlug: result.page.slug,
        pageTitle: result.page.title,
        cleanedNavigationNodeCount: result.cleanedNavigationNodeCount,
      }),
    );
  }

  return NavigationBindingCleanupResultSchema.parse({
    cleanedNavigationNodeCount: affectedPages.reduce(
      (total, page) => total + page.cleanedNavigationNodeCount,
      0,
    ),
    updatedPageIds: affectedPages.map((page) => page.pageId),
    updatedPageSlugs: affectedPages.map((page) => page.pageSlug),
    affectedPages,
  });
}
