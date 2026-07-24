import { extractTextContent } from "../../../../../../lib/blocks/nodesToHtml";
import type {
  BuilderNode,
  ComponentDSL,
  LayoutDSL,
  PageDSL,
} from "../../../../../../lib/types/nodes";

const SEO_TEXT_EXCERPT_MAX = 2500;
const SEO_HEADING_LIMIT = 12;

export function summarizeNodes(nodes: BuilderNode[] | undefined): {
  blockCount: number;
  rootTypes: string[];
} {
  const list = nodes ?? [];
  return {
    blockCount: list.length,
    rootTypes: list.slice(0, 8).map((node) => node.type),
  };
}

function collectHeadings(nodes: BuilderNode[]): string[] {
  const headings: string[] = [];

  function traverse(node: BuilderNode) {
    if (/^h[1-6]$/i.test(node.type)) {
      const text = node.props.text ?? node.props.content ?? node.props.value;
      if (typeof text === "string") {
        const trimmed = text.trim();
        if (trimmed) headings.push(trimmed);
      }
    }

    node.children?.forEach(traverse);
  }

  nodes.forEach(traverse);
  return headings.slice(0, SEO_HEADING_LIMIT);
}

function excerptText(nodes: BuilderNode[]): string | undefined {
  const raw = extractTextContent(nodes).replace(/\s+/g, " ").trim();
  if (!raw) return undefined;
  if (raw.length <= SEO_TEXT_EXCERPT_MAX) return raw;
  return `${raw.slice(0, SEO_TEXT_EXCERPT_MAX)}…`;
}

export function summarizePageDslForSeo(dsl: PageDSL): Record<string, unknown> {
  const nodes = dsl.nodes ?? [];
  const seo = dsl.settings?.seo;

  return {
    id: dsl.id,
    slug: dsl.slug ?? dsl.id,
    title: dsl.title,
    description: dsl.description,
    layout: dsl.layout,
    systemRole: dsl.systemRole ?? "standard",
    accessMode: dsl.accessMode ?? "public",
    nodes: summarizeNodes(nodes),
    headings: collectHeadings(nodes),
    contentExcerpt: excerptText(nodes),
    seo: seo
      ? {
          title: seo.title,
          description: seo.description,
          ogTitle: seo.ogTitle,
          ogDescription: seo.ogDescription,
          ogImage: seo.ogImage,
          canonical: seo.canonical,
          noindex: seo.noindex,
          nofollow: seo.nofollow,
        }
      : undefined,
    version: dsl.version,
    updatedAt: dsl.updatedAt,
  };
}

export function summarizePageDsl(
  dsl: PageDSL,
  detail: "summary" | "full" | "seo",
): Record<string, unknown> {
  if (detail === "seo") {
    return summarizePageDslForSeo(dsl);
  }

  const nodes =
    detail === "full" ? dsl.nodes : summarizeNodes(dsl.nodes);
  return {
    id: dsl.id,
    slug: dsl.id,
    title: dsl.title,
    nodes,
    version: dsl.version,
    updatedAt: dsl.updatedAt,
  };
}

export function summarizeLayoutDsl(
  dsl: LayoutDSL,
  detail: "summary" | "full" | "seo",
): Record<string, unknown> {
  const slots = dsl.slots?.map((slot) => ({
    name: slot.name,
    isDefault: slot.isDefault,
    blockCount: Array.isArray(slot.defaultContent)
      ? slot.defaultContent.length
      : 0,
    defaultContent:
      detail === "full" ? slot.defaultContent : undefined,
  }));
  return {
    id: dsl.id,
    slug: dsl.slug,
    title: dsl.title,
    slots,
    version: dsl.version,
    updatedAt: dsl.updatedAt,
  };
}

export function summarizeComponentDsl(
  dsl: ComponentDSL,
  detail: "summary" | "full" | "seo",
): Record<string, unknown> {
  const nodes =
    detail === "full" ? dsl.nodes : summarizeNodes(dsl.nodes);
  return {
    id: dsl.id,
    slug: dsl.id,
    title: dsl.title,
    nodes,
    version: dsl.version,
    updatedAt: dsl.updatedAt,
  };
}
