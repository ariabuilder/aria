/**
 * Extracts HTML content from DSL nodes for Tailwind CSS compilation. Tailwind
 * v4 scans HTML directly to determine which classes to include.
 */

import type { BuilderNode } from "../types/nodes";
import type { StorageAdapter } from "../storage/adapter";
import { classNamesToString } from "../schemas/classEditor";
import { log } from "../utils/logger";
import {
  nodesToHtmlFragmentAsync,
  nodesToHtmlWithLayoutAsync,
} from "../blocks/nodesToHtml";
import {
  createDefaultUniversalDesignSystem,
  resolveBreakpointDefinitionsFromDesignSystem,
} from "./universalDesignSystem";
import { collectUtilityClassesFromNodes } from "./collectUtilityClasses";

/**
 * Generate HTML from a node tree for UnoCSS scanning.
 * Extracts classes from `classNames` and `customClasses` fields,
 * so the generator sees every utility in use.
 *
 * @param nodes - Array of builder nodes
 * @param darkModeClass - Whether to add dark class for testing dark mode variants
 * @returns Minimal HTML string with all className attributes
 */
export function generateHTMLForScan(
  nodes: BuilderNode[],
  darkModeClass = false,
): string {
  function traverseNode(node: BuilderNode): string {
    const classParts: string[] = [];

    // Structured class format: { base: ["flex"], md: ["gap-6"], hover: ["bg-blue-600"] }
    if (node.classNames) {
      const flat = classNamesToString(node.classNames);
      if (flat) classParts.push(flat);
    }

    if (Array.isArray(node.customClasses)) {
      classParts.push(...node.customClasses.filter(Boolean));
    }

    const classes = classParts.join(" ");

    const tag = getHTMLTag(node.type);
    const classAttr = classes ? ` class="${classes}"` : "";

    const childrenHTML = node.children
      .map((child) => traverseNode(child))
      .join("");

    if (childrenHTML) {
      return `<${tag}${classAttr}>${childrenHTML}</${tag}>`;
    } else {
      // Self-closing for empty elements
      return `<${tag}${classAttr}></${tag}>`;
    }
  }

  const bodyContent = nodes.map((node) => traverseNode(node)).join("");

  // Wrap in minimal HTML structure
  const htmlClass = darkModeClass ? ' class="dark"' : "";
  return `<!DOCTYPE html>
<html${htmlClass}>
<head>
  <meta charset="UTF-8">
  <title>Scan</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

/**
 * Map node type to HTML tag
 * Returns appropriate semantic HTML tag for better scanning
 */
function getHTMLTag(type: string): string {
  // Built-in types
  const typeMap: Record<string, string> = {
    Container: "div",
    Section: "section",
    Article: "article",
    Header: "header",
    Footer: "footer",
    Nav: "nav",
    Main: "main",
    Aside: "aside",
    Button: "button",
    Link: "a",
    Image: "img",
    Text: "span",
    Heading: "h2",
    Paragraph: "p",
    List: "ul",
    ListItem: "li",
    Form: "form",
    Input: "input",
    Textarea: "textarea",
    Select: "select",
    Option: "option",
    Label: "label",
  };

  // Check built-in types
  if (typeMap[type]) {
    return typeMap[type];
  }

  // Custom components (prefixed with "custom:")
  if (type.startsWith("custom:")) {
    return "div"; // Default to div for custom components
  }

  // Unknown types default to div
  return "div";
}

/**
 * Scan all DSL content and generate combined HTML
 *
 * @param adapter - Storage adapter to load DSL content
 * @returns Combined HTML string with all pages, layouts, and components
 */
export interface UnoCSSScanResult {
  htmlContent: string;
  utilityClasses: string[];
}

export interface UnoCSSScanOptions {
  additionalNodes?: readonly BuilderNode[];
}

export async function scanAllDSLForUnoCSS(
  adapter: StorageAdapter,
  options: UnoCSSScanOptions = {},
): Promise<UnoCSSScanResult> {
  const htmlParts: string[] = [];
  const utilityClasses = new Set<string>();
  const getComponentDSL = (id: string) => adapter.getComponentDSL(id);
  let canonicalBreakpoints = resolveBreakpointDefinitionsFromDesignSystem(
    createDefaultUniversalDesignSystem(),
  );

  try {
    const [_siteSettings, designSystem] = await Promise.all([
      adapter.getSiteSettings(),
      adapter
        .getDesignSystem()
        .then((value) => value ?? createDefaultUniversalDesignSystem()),
    ]);
    canonicalBreakpoints =
      resolveBreakpointDefinitionsFromDesignSystem(designSystem);

    const collectNodes = (nodes: readonly BuilderNode[] | undefined): void => {
      if (!nodes?.length) return;
      for (const className of collectUtilityClassesFromNodes(
        nodes,
        canonicalBreakpoints,
      )) {
        utilityClasses.add(className);
      }
    };

    collectNodes(options.additionalNodes);

    const pages = await adapter.listPagesDSL();
    for (const pageMeta of pages) {
      const page = await adapter.getPageDSL(pageMeta.id);
      if (page?.nodes) {
        collectNodes(page.nodes);
        if (page.layout) {
          const layout = await adapter.getLayoutDSL(page.layout);
          collectNodes(layout?.nodes);
          for (const slot of layout?.slots ?? []) {
            collectNodes(slot.defaultContent);
          }
          const slotOnlyLayout =
            layout &&
            (!layout.nodes || layout.nodes.length === 0) &&
            Array.isArray(layout.slots) &&
            layout.slots.length > 0;

          if (layout?.nodes?.length) {
            htmlParts.push(
              await nodesToHtmlWithLayoutAsync(
                page.nodes,
                layout.nodes,
                getComponentDSL,
                {
                  breakpoints: canonicalBreakpoints,
                  layoutSlots: layout.slots ?? [],
                },
              ),
            );
            continue;
          }

          if (slotOnlyLayout) {
            const { mergePageBlocksWithLayoutSlotsForPublish } =
              await import("../layouts/canvasSlotMerge");
            const merged = mergePageBlocksWithLayoutSlotsForPublish(
              page.nodes,
              layout,
            );
            const body = await nodesToHtmlFragmentAsync(
              merged,
              getComponentDSL,
              0,
              canonicalBreakpoints,
            );
            htmlParts.push(`<!DOCTYPE html><html><body>${body}</body></html>`);
            continue;
          }
        }

        htmlParts.push(
          `<!DOCTYPE html><html><body>${await nodesToHtmlFragmentAsync(
            page.nodes,
            getComponentDSL,
            0,
            canonicalBreakpoints,
          )}</body></html>`,
        );
      }
    }

    const layouts = await adapter.listLayoutsDSL();
    for (const layoutMeta of layouts) {
      const layout = await adapter.getLayoutDSL(layoutMeta.id);
      if (layout?.nodes) {
        collectNodes(layout.nodes);
        for (const slot of layout.slots ?? []) {
          collectNodes(slot.defaultContent);
        }
        htmlParts.push(
          `<!DOCTYPE html><html><body>${await nodesToHtmlFragmentAsync(
            layout.nodes,
            getComponentDSL,
            0,
            canonicalBreakpoints,
          )}</body></html>`,
        );
      }
    }

    const components = await adapter.listComponentsDSL();
    for (const componentMeta of components) {
      const component = await adapter.getComponentDSL(componentMeta.id);
      if (component?.nodes) {
        collectNodes(component.nodes);
        for (const slot of component.slots ?? []) {
          collectNodes(slot.defaultContent);
        }
        htmlParts.push(
          `<!DOCTYPE html><html><body>${await nodesToHtmlFragmentAsync(
            component.nodes,
            getComponentDSL,
            0,
            canonicalBreakpoints,
          )}</body></html>`,
        );
      }
    }
  } catch (error) {
    log("error", "Error scanning DSL for HTML", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return empty HTML on error
    return {
      htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Scan</title>
</head>
<body>
  <!-- Error scanning DSL content -->
</body>
</html>`,
      utilityClasses: Array.from(utilityClasses).sort(),
    };
  }

  const combinedBody = htmlParts
    .map((html) => {
      // Extract body content from each HTML
      const match = html.match(/<body>(.*?)<\/body>/s);
      return match ? match[1] : "";
    })
    .filter(Boolean)
    .join("\n");

  return {
    htmlContent: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Full Site Scan</title>
</head>
<body>
${combinedBody}
</body>
</html>`,
    utilityClasses: Array.from(utilityClasses).sort(),
  };
}

export async function scanAllDSLForHTML(
  adapter: StorageAdapter,
): Promise<string> {
  return (await scanAllDSLForUnoCSS(adapter)).htmlContent;
}

/**
 * Extract unique Tailwind classes from HTML content
 * Useful for debugging and analytics
 *
 * @param html - HTML string to scan
 * @returns Array of unique Tailwind class names
 */
export function extractTailwindClasses(html: string): string[] {
  const classMatches = html.matchAll(/class="([^"]*)"/g);
  const classes = new Set<string>();

  for (const match of classMatches) {
    const classList = match[1].split(/\s+/).filter(Boolean);
    classList.forEach((cls) => classes.add(cls));
  }

  return Array.from(classes).sort();
}
