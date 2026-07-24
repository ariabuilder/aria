import { generateNodeId } from "../ids/nodeId";
import type { JsonObject, JsonValue } from "../types/nodes";
import { isJsonValue } from "../types/nodes";

/**
 * HTML to Blocks Converter
 *
 * Converts Astro/component HTML content into editable blocks that can be
 * manipulated in the builder. Works for pages, layouts, and components.
 */

export interface Block {
  id: string;
  type: string;
  props: JsonObject;
  children?: Block[];
}

export type ConvertibleType = "page" | "layout" | "component";

/**
 * Parse Astro/component file content and extract HTML
 * Works for pages (full HTML with body), layouts, and components
 */
export function extractHTMLFromAstro(
  astroContent: string,
  type: ConvertibleType = "page",
): string {
  const withoutFrontmatter = astroContent.replace(/^---[\s\S]*?---\s*/m, "");

  if (type === "page") {
    // Pages: Extract body content (everything between <body> and </body>)
    const bodyMatch = withoutFrontmatter.match(
      /<body[^>]*>([\s\S]*?)<\/body>/i,
    );
    if (bodyMatch) {
      return bodyMatch[1].trim();
    }
  }

  // Layouts & Components: Return everything after frontmatter
  // (they don't have <body> tags, just template content)
  return withoutFrontmatter.trim();
}

/**
 * Convert HTML string to block structure
 */
export function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];

  // Create a temporary DOM parser
  if (typeof DOMParser === "undefined") {
    // Server-side: use a simple regex-based parser
    return parseHTMLServerSide(html);
  }

  // Client-side: use DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstChild as HTMLElement;

  if (!root) return blocks;

  // Convert each top-level element to a block
  Array.from(root.children).forEach((element) => {
    const block = elementToBlock(element as HTMLElement);
    if (block) {
      blocks.push(block);
    }
  });

  return blocks;
}

function createTextBlock(content: string): Block | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  return {
    id: generateNodeId(),
    type: "text",
    props: {
      content: trimmed,
    },
  };
}

function getLinkPropsFromAttributes(attrs: JsonObject): JsonObject {
  const linkProps: JsonObject = {};

  if (typeof attrs.href === "string" && attrs.href.trim().length > 0) {
    linkProps.href = attrs.href;
  }

  if (typeof attrs.target === "string" && attrs.target.trim().length > 0) {
    linkProps.target = attrs.target;
  }

  if (typeof attrs.rel === "string" && attrs.rel.trim().length > 0) {
    linkProps.rel = attrs.rel;
  }

  if (typeof attrs.title === "string" && attrs.title.trim().length > 0) {
    linkProps.title = attrs.title;
  }

  if (attrs.download === true || attrs.download === "") {
    linkProps.download = true;
  }

  return linkProps;
}

function createBlocksFromHtmlFragment(content: string): Block[] {
  const childBlocks = parseHTMLServerSide(content);
  if (childBlocks.length > 0) {
    return childBlocks;
  }

  const textBlock = createTextBlock(content);
  return textBlock ? [textBlock] : [];
}

function getLinkBlockChildren(block: Block): Block[] {
  if (block.children && block.children.length > 0) {
    return block.children;
  }

  const textContent =
    typeof block.props.content === "string"
      ? block.props.content
      : typeof block.props.text === "string"
        ? block.props.text
        : "";
  const textBlock = createTextBlock(textContent);
  return textBlock ? [textBlock] : [];
}

function createListItemBlockFromHtml(
  attrs: JsonObject,
  content: string,
): Block {
  const childBlocks = parseHTMLServerSide(content);
  const trimmedContent = content.trim();

  if (
    childBlocks.length === 1 &&
    childBlocks[0]?.type === "link" &&
    /^<a\b/i.test(trimmedContent) &&
    /<\/a>$/i.test(trimmedContent)
  ) {
    const linkChild = childBlocks[0];
    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
        ...getLinkPropsFromAttributes(linkChild.props),
        linkScope: "row",
      },
      children: getLinkBlockChildren(linkChild),
    };
  }

  const linkChildIndex = childBlocks.findIndex(
    (child) => child.type === "link",
  );
  if (linkChildIndex !== -1) {
    const linkChild = childBlocks[linkChildIndex]!;
    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
        ...getLinkPropsFromAttributes(linkChild.props),
        linkScope: "text",
      },
      children: [
        ...childBlocks.slice(0, linkChildIndex),
        ...getLinkBlockChildren(linkChild),
        ...childBlocks.slice(linkChildIndex + 1),
      ],
    };
  }

  if (childBlocks.length > 0) {
    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
      },
      children: childBlocks,
    };
  }

  return {
    id: generateNodeId(),
    type: "listitem",
    props: {
      content: trimmedContent,
      ...attrs,
    },
  };
}

/**
 * Server-side HTML parser (regex-based, simple approach)
 */
function parseHTMLServerSide(html: string): Block[] {
  const blocks: Block[] = [];

  const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [, tagName, attributes, content] = match;

    const block = createBlockFromTag(tagName, attributes, content);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function createBlockFromTag(
  tagName: string,
  attributes: string,
  content: string,
): Block | null {
  const tag = tagName.toLowerCase();

  const attrs = parseAttributes(attributes);

  // Map HTML tags to block types
  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return {
        id: generateNodeId(),
        type: "heading",
        props: {
          level: parseInt(tag[1]),
          text: content.trim(),
          ...attrs,
        },
      };

    case "p":
      return {
        id: generateNodeId(),
        type: "text",
        props: {
          content: content.trim(),
          ...attrs,
        },
      };

    case "img":
      return {
        id: generateNodeId(),
        type: "image",
        props: {
          src: attrs.src || "",
          alt: attrs.alt || "",
          ...attrs,
        },
      };

    case "a":
      const anchorChildren = createBlocksFromHtmlFragment(content);
      return {
        id: generateNodeId(),
        type: "link",
        props: {
          href: attrs.href || "#",
          text: content.trim(),
          ...attrs,
        },
        ...(anchorChildren.length > 0 ? { children: anchorChildren } : {}),
      };

    case "ul":
    case "ol":
      return {
        id: generateNodeId(),
        type: "list",
        props: {
          ordered: tag === "ol",
          ...attrs,
        },
        children: parseHTMLServerSide(content),
      };

    case "li":
      return createListItemBlockFromHtml(attrs, content);

    case "div":
    case "section":
    case "article":
      // Check if it's a container with children
      const childBlocks = parseHTMLServerSide(content);
      return {
        id: generateNodeId(),
        type: "container",
        props: {
          tag: tag,
          ...attrs,
        },
        children: childBlocks,
      };

    case "button":
      return {
        id: generateNodeId(),
        type: "button",
        props: {
          text: content.trim(),
          ...attrs,
        },
      };

    default:
      // Generic block for unknown tags
      return {
        id: generateNodeId(),
        type: "html",
        props: {
          tag: tag,
          content: content,
          ...attrs,
        },
      };
  }
}

/**
 * Parse HTML attributes string into object
 */
function parseAttributeValue(value: string): JsonValue {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (!isNaN(Number(value)) && value !== "") {
    return Number(value);
  }

  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isJsonValue(parsed)) {
        return parsed;
      }
    } catch {
      // Keep the raw string when the attribute is not valid JSON.
    }
  }

  return value;
}

function parseAttributes(attributesString: string): JsonObject {
  const attrs: JsonObject = {};

  // Match attribute="value" or attribute='value' or attribute=value
  const attrRegex = /(\w+)=["']?([^"'\s>]+)["']?/g;
  let match;

  while ((match = attrRegex.exec(attributesString)) !== null) {
    const [, name, value] = match;
    attrs[name] = parseAttributeValue(value);
  }

  // Note: class attribute is kept as-is (attrs.class)
  // It is NOT renamed to attrs.className — that legacy convention has been removed.
  // The import/paste pipeline handles class attributes separately via parseClassNameString.

  return attrs;
}

/**
 * Convert DOM element to block (client-side)
 */
function elementToBlock(element: HTMLElement): Block | null {
  const tagName = element.tagName.toLowerCase();

  const attrs = getElementAttributes(element);

  // Map elements to blocks
  switch (tagName) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return {
        id: generateNodeId(),
        type: "heading",
        props: {
          level: parseInt(tagName[1]),
          text: element.textContent?.trim() || "",
          ...attrs,
        },
      };

    case "p":
      return {
        id: generateNodeId(),
        type: "text",
        props: {
          content: element.innerHTML,
          ...attrs,
        },
      };

    case "img":
      return {
        id: generateNodeId(),
        type: "image",
        props: {
          src: element.getAttribute("src") || "",
          alt: element.getAttribute("alt") || "",
          ...attrs,
        },
      };

    case "a":
      const anchorChildren = createBlocksFromElementChildren(element);
      return {
        id: generateNodeId(),
        type: "link",
        props: {
          href: element.getAttribute("href") || "#",
          text: element.textContent?.trim() || "",
          ...attrs,
        },
        ...(anchorChildren.length > 0 ? { children: anchorChildren } : {}),
      };

    case "button":
      return {
        id: generateNodeId(),
        type: "button",
        props: {
          text: element.textContent?.trim() || "",
          ...attrs,
        },
      };

    case "ul":
    case "ol":
      return {
        id: generateNodeId(),
        type: "list",
        props: {
          ordered: tagName === "ol",
          ...attrs,
        },
        children: createBlocksFromElementChildren(element),
      };

    case "li":
      return createListItemBlockFromElement(element as HTMLLIElement, attrs);

    case "div":
    case "section":
    case "article":
      // Container with children
      const children = createBlocksFromElementChildren(element);

      return {
        id: generateNodeId(),
        type: "container",
        props: {
          tag: tagName,
          ...attrs,
        },
        children,
      };

    default:
      return {
        id: generateNodeId(),
        type: "html",
        props: {
          tag: tagName,
          content: element.innerHTML,
          ...attrs,
        },
      };
  }
}

function getElementAttributes(element: HTMLElement): JsonObject {
  const attrs: JsonObject = {};

  Array.from(element.attributes).forEach((attr) => {
    attrs[attr.name === "class" ? "className" : attr.name] =
      parseAttributeValue(attr.value);
  });

  return attrs;
}

function createBlocksFromElementChildren(element: HTMLElement): Block[] {
  const blocks: Block[] = [];

  element.childNodes.forEach((childNode) => {
    if (childNode.nodeType === Node.TEXT_NODE) {
      const textBlock = createTextBlock(childNode.textContent || "");
      if (textBlock) {
        blocks.push(textBlock);
      }
      return;
    }

    if (childNode.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const childBlock = elementToBlock(childNode as HTMLElement);
    if (childBlock) {
      blocks.push(childBlock);
    }
  });

  return blocks;
}

function createBlocksFromAnchorElement(anchor: HTMLAnchorElement): Block[] {
  const blocks = createBlocksFromElementChildren(anchor);
  if (blocks.length > 0) {
    return blocks;
  }

  const textBlock = createTextBlock(anchor.textContent || "");
  return textBlock ? [textBlock] : [];
}

function createListItemBlockFromElement(
  element: HTMLLIElement,
  attrs: JsonObject,
): Block {
  const directElementChildren = Array.from(element.children);
  const directAnchorChildren = directElementChildren.filter(
    (child) => child.tagName.toLowerCase() === "a",
  ) as HTMLAnchorElement[];
  const hasLooseText = Array.from(element.childNodes).some(
    (node) =>
      node.nodeType === Node.TEXT_NODE &&
      Boolean(node.textContent?.trim().length),
  );

  if (
    directAnchorChildren.length === 1 &&
    directElementChildren.length === 1 &&
    !hasLooseText
  ) {
    const anchor = directAnchorChildren[0]!;
    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
        ...getLinkPropsFromAttributes(getElementAttributes(anchor)),
        linkScope: "row",
      },
      children: createBlocksFromAnchorElement(anchor),
    };
  }

  if (directAnchorChildren.length === 1) {
    const anchor = directAnchorChildren[0]!;
    const anchorChildren = createBlocksFromAnchorElement(anchor);
    const childBlocks: Block[] = [];

    element.childNodes.forEach((childNode) => {
      if (childNode === anchor) {
        childBlocks.push(...anchorChildren);
        return;
      }

      if (childNode.nodeType === Node.TEXT_NODE) {
        const textBlock = createTextBlock(childNode.textContent || "");
        if (textBlock) {
          childBlocks.push(textBlock);
        }
        return;
      }

      if (childNode.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const childBlock = elementToBlock(childNode as HTMLElement);
      if (childBlock) {
        childBlocks.push(childBlock);
      }
    });

    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
        ...getLinkPropsFromAttributes(getElementAttributes(anchor)),
        linkScope: "text",
      },
      children: childBlocks,
    };
  }

  const childBlocks = createBlocksFromElementChildren(element);
  if (childBlocks.length > 0) {
    return {
      id: generateNodeId(),
      type: "listitem",
      props: {
        ...attrs,
      },
      children: childBlocks,
    };
  }

  return {
    id: generateNodeId(),
    type: "listitem",
    props: {
      content: element.innerHTML.trim() || element.textContent?.trim() || "",
      ...attrs,
    },
  };
}

export function blocksToHTML(blocks: Block[]): string {
  return blocks.map(blockToHTML).join("\n");
}

function blockToHTML(block: Block): string {
  const { type, props, children } = block;

  const attrsString = Object.entries(props)
    .filter(
      ([key]) =>
        !["text", "content", "level", "tag", "href", "src", "alt"].includes(
          key,
        ),
    )
    .map(([key, value]) => {
      const attrName = key === "className" ? "class" : key;
      return `${attrName}="${value}"`;
    })
    .join(" ");

  const attrs = attrsString ? ` ${attrsString}` : "";

  switch (type) {
    case "heading":
      const level = props.level || 1;
      return `<h${level}${attrs}>${props.text || ""}</h${level}>`;

    case "text":
      return `<p${attrs}>${props.content || ""}</p>`;

    case "image":
      return `<img src="${props.src || ""}" alt="${props.alt || ""}"${attrs} />`;

    case "link":
      return `<a href="${props.href || "#"}"${attrs}>${props.text || ""}</a>`;

    case "button":
      return `<button${attrs}>${props.text || ""}</button>`;

    case "container":
      const tag = props.tag || "div";
      const childrenHTML = children ? blocksToHTML(children) : "";
      return `<${tag}${attrs}>${childrenHTML}</${tag}>`;

    case "html":
      const htmlTag = props.tag || "div";
      return `<${htmlTag}${attrs}>${props.content || ""}</${htmlTag}>`;

    default:
      return `<!-- Unknown block type: ${type} -->`;
  }
}

/**
 * Merge existing page blocks with builder blocks
 * Builder blocks take precedence
 */
export function mergeBlocks(
  existingBlocks: Block[],
  builderBlocks: Block[],
): Block[] {
  // If no builder blocks, use existing
  if (builderBlocks.length === 0) {
    return existingBlocks;
  }

  // If builder has blocks, they take precedence
  // But we can merge by checking if IDs match
  const merged = [...builderBlocks];

  // Add any existing blocks that aren't in builder blocks
  existingBlocks.forEach((existingBlock) => {
    const found = builderBlocks.find((b) => b.id === existingBlock.id);
    if (!found) {
      merged.push(existingBlock);
    }
  });

  return merged;
}

/**
 * Main conversion function: Load content and convert to unified block structure
 * Works for pages, layouts, and components
 *
 * @param astroContent - The .astro file content to convert
 * @param builderBlocks - Existing blocks from the builder (for merging)
 * @param type - The type of content being converted ('page', 'layout', or 'component')
 */
export function convertToBlocks(
  astroContent: string,
  builderBlocks: Block[] = [],
  type: ConvertibleType = "page",
): Block[] {
  // Extract HTML from Astro file
  const html = extractHTMLFromAstro(astroContent, type);

  // Convert to blocks
  const existingBlocks = htmlToBlocks(html);

  // Merge with builder blocks
  return mergeBlocks(existingBlocks, builderBlocks);
}

/**
 * Alias for backward compatibility
 * @deprecated Use convertToBlocks instead
 */
export function convertPageToBlocks(
  astroContent: string,
  builderBlocks: Block[] = [],
): Block[] {
  return convertToBlocks(astroContent, builderBlocks, "page");
}
