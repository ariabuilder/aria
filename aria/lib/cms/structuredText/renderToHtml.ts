import { z } from "zod";
import {
  StructuredTextDocumentSchema,
  type StructuredTextBlock,
  type StructuredTextMarkDef,
  type StructuredTextSpan,
} from "./schemas";

const RenderStructuredTextOptionsSchema = z
  .object({
    resolveImageUrl: z
      .function({
        input: [z.string()],
        output: z.string().nullable().optional(),
      })
      .optional(),
    resolveEntryHref: z
      .function({
        input: [z.string(), z.string()],
        output: z.string().nullable().optional(),
      })
      .optional(),
    resolvePageHref: z
      .function({
        input: [z.string()],
        output: z.string().nullable().optional(),
      })
      .optional(),
  })
  .strict();

export type RenderStructuredTextOptions = z.infer<
  typeof RenderStructuredTextOptionsSchema
>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    /^tel:/i.test(trimmed)
  ) {
    return trimmed;
  }
  return "#";
}

function markDefByKey(
  markDefs: readonly StructuredTextMarkDef[],
): Map<string, StructuredTextMarkDef> {
  return new Map(markDefs.map((markDef) => [markDef._key, markDef]));
}

function renderCaption(caption: readonly StructuredTextSpan[] | undefined): string {
  if (!caption || caption.length === 0) {
    return "";
  }
  return `<figcaption>${caption.map((span) => escapeHtml(span.text)).join("")}</figcaption>`;
}

function renderSpan(
  span: StructuredTextSpan,
  markDefs: ReadonlyMap<string, StructuredTextMarkDef>,
  options: RenderStructuredTextOptions,
): string {
  const renderedText = escapeHtml(span.text).replace(/\n/g, "<br>");
  return span.marks.reduce((html, mark) => {
    const markDef = markDefs.get(mark);
    if (markDef?._type === "link") {
      const href = safeHref(markDef.href);
      const target = markDef.openInNewTab
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
      return `<a href="${escapeHtml(href)}"${target}>${html}</a>`;
    }
    if (markDef?._type === "entryLink") {
      const resolvedHref = options.resolveEntryHref?.(
        markDef.collectionId,
        markDef.entryId,
      );
      const href = safeHref(resolvedHref ?? "#");
      return `<a href="${escapeHtml(href)}" data-entry-id="${escapeHtml(markDef.entryId)}">${html}</a>`;
    }
    if (markDef?._type === "pageLink") {
      const resolvedHref = options.resolvePageHref?.(markDef.pageId);
      const href = safeHref(resolvedHref ?? "#");
      return `<a href="${escapeHtml(href)}" data-page-id="${escapeHtml(markDef.pageId)}">${html}</a>`;
    }

    switch (mark) {
      case "strong":
      case "bold":
        return `<strong>${html}</strong>`;
      case "em":
      case "italic":
        return `<em>${html}</em>`;
      case "code":
        return `<code>${html}</code>`;
      case "strike":
        return `<s>${html}</s>`;
      case "underline":
        return `<u>${html}</u>`;
      default:
        return html;
    }
  }, renderedText);
}

function renderBlockChildren(
  block: Extract<StructuredTextBlock, { _type: "block" }>,
  options: RenderStructuredTextOptions,
): string {
  const markDefs = markDefByKey(block.markDefs);
  return block.children
    .map((span) => renderSpan(span, markDefs, options))
    .join("");
}

function renderTextBlock(
  block: Extract<StructuredTextBlock, { _type: "block" }>,
  options: RenderStructuredTextOptions,
): string {
  const html = renderBlockChildren(block, options);
  if (block.listItem) {
    return `<li>${html}</li>`;
  }

  switch (block.style) {
    case "h2":
      return `<h2>${html}</h2>`;
    case "h3":
      return `<h3>${html}</h3>`;
    case "h4":
      return `<h4>${html}</h4>`;
    case "blockquote":
      return `<blockquote>${html}</blockquote>`;
    case "normal":
      return `<p>${html}</p>`;
  }
}

function renderNonTextBlock(
  block: Exclude<StructuredTextBlock, { _type: "block" }>,
  options: RenderStructuredTextOptions,
): string {
  switch (block._type) {
    case "image": {
      const src = options.resolveImageUrl?.(block.mediaId);
      if (!src) {
        return "";
      }
      const image = `<img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt ?? "")}" loading="lazy">`;
      return `<figure>${image}${renderCaption(block.caption)}</figure>`;
    }
    case "embed":
      return `<div data-embed-provider="${escapeHtml(block.provider)}" data-embed-url="${escapeHtml(safeHref(block.url))}"></div>`;
    case "divider":
      return "<hr>";
  }
}

function listTag(block: Extract<StructuredTextBlock, { _type: "block" }>): "ol" | "ul" {
  return block.listItem === "number" ? "ol" : "ul";
}

export function renderStructuredTextToHtml(
  document: unknown,
  optionsInput: RenderStructuredTextOptions = {},
): string {
  const blocks = StructuredTextDocumentSchema.parse(document);
  const options = RenderStructuredTextOptionsSchema.parse(optionsInput);
  const html: string[] = [];
  let activeList: "ol" | "ul" | null = null;

  function closeList(): void {
    if (!activeList) return;
    html.push(`</${activeList}>`);
    activeList = null;
  }

  for (const block of blocks) {
    if (block._type === "block" && block.listItem) {
      const nextList = listTag(block);
      if (activeList !== nextList) {
        closeList();
        html.push(`<${nextList}>`);
        activeList = nextList;
      }
      html.push(renderTextBlock(block, options));
      continue;
    }

    closeList();
    html.push(
      block._type === "block"
        ? renderTextBlock(block, options)
        : renderNonTextBlock(block, options),
    );
  }

  closeList();
  return html.filter((chunk) => chunk.length > 0).join("");
}
