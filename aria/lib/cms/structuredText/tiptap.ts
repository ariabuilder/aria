import type { JSONContent } from "@tiptap/core";
import { generateId } from "../../crypto";
import {
  StructuredTextDocumentSchema,
  type StructuredTextBlock,
  type StructuredTextDocument,
  type StructuredTextMarkDef,
  type StructuredTextSpan,
} from "./schemas";
import {
  STRUCTURED_EMBED_NODE_NAME,
  STRUCTURED_IMAGE_NODE_NAME,
  StructuredEmbedNodeAttrsSchema,
  StructuredImageNodeAttrsSchema,
} from "./tiptapExtensions";

type TextBlock = Extract<StructuredTextBlock, { _type: "block" }>;
type TiptapMark = NonNullable<JSONContent["marks"]>[number];

function createKey(): string {
  return generateId();
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function markAttrs(mark: TiptapMark): Record<string, unknown> {
  return mark.attrs && typeof mark.attrs === "object" ? mark.attrs : {};
}

function nodeAttrs(node: JSONContent): Record<string, unknown> {
  return node.attrs && typeof node.attrs === "object" ? node.attrs : {};
}

function markKey(mark: TiptapMark): string {
  if (mark.type === "bold") return "strong";
  if (mark.type === "italic") return "em";
  if (mark.type === "strike") return "strike";
  if (mark.type === "code") return "code";
  return mark.type ?? "";
}

function convertMarks(
  marks: readonly TiptapMark[] | undefined,
  markDefs: StructuredTextMarkDef[],
): string[] {
  if (!marks) return [];

  return marks
    .map((mark) => {
      if (mark.type !== "link") {
        return markKey(mark);
      }

      const attrs = markAttrs(mark);
      const href = asText(attrs.href).trim();
      if (!href) return "";

      const key = createKey();
      markDefs.push({
        _key: key,
        _type: "link",
        href,
        openInNewTab: attrs.target === "_blank",
      });
      return key;
    })
    .filter((mark) => mark.length > 0);
}

function textNodesToSpans(
  nodes: readonly JSONContent[] | undefined,
  markDefs: StructuredTextMarkDef[],
): StructuredTextSpan[] {
  const spans =
    nodes
      ?.flatMap((node) => {
        if (node.type === "hardBreak") {
          return [{
            _type: "span" as const,
            _key: createKey(),
            text: "\n",
            marks: [],
          }];
        }
        if (node.type !== "text" || typeof node.text !== "string") {
          return [];
        }
        return [{
          _type: "span" as const,
          _key: createKey(),
          text: node.text,
          marks: convertMarks(node.marks, markDefs),
        }];
      }) ?? [];

  return spans.length > 0
    ? spans
    : [
        {
          _type: "span",
          _key: createKey(),
          text: "",
          marks: [],
        },
      ];
}

function createTextBlock(input: {
  style: TextBlock["style"];
  content: readonly JSONContent[] | undefined;
  listItem?: TextBlock["listItem"];
  level?: number;
}): TextBlock {
  const markDefs: StructuredTextMarkDef[] = [];
  return {
    _type: "block",
    _key: createKey(),
    style: input.style,
    listItem: input.listItem,
    level: input.level,
    markDefs,
    children: textNodesToSpans(input.content, markDefs),
  };
}

function plainTextToSpans(text: string): StructuredTextSpan[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return [
    {
      _type: "span",
      _key: createKey(),
      text: trimmed,
      marks: [],
    },
  ];
}

function spansToPlainText(spans: readonly StructuredTextSpan[] | undefined): string {
  return spans?.map((span) => span.text).join("") ?? "";
}

function headingStyle(level: unknown): TextBlock["style"] {
  return level === 3 ? "h3" : level === 4 ? "h4" : "h2";
}

function convertListItem(
  item: JSONContent,
  listItem: NonNullable<TextBlock["listItem"]>,
): TextBlock[] {
  const content = item.content ?? [];
  const paragraph = content.find((node) => node.type === "paragraph");
  return [
    createTextBlock({
      style: "normal",
      content: paragraph?.content,
      listItem,
      level: 1,
    }),
  ];
}

function convertNode(node: JSONContent): StructuredTextBlock[] {
  switch (node.type) {
    case "paragraph":
      return [createTextBlock({ style: "normal", content: node.content })];
    case "heading":
      return [
        createTextBlock({
          style: headingStyle(nodeAttrs(node).level),
          content: node.content,
        }),
      ];
    case "blockquote":
      return [
        createTextBlock({
          style: "blockquote",
          content: node.content?.flatMap((child) => child.content ?? []),
        }),
      ];
    case "bulletList":
      return (node.content ?? []).flatMap((item) =>
        convertListItem(item, "bullet"),
      );
    case "orderedList":
      return (node.content ?? []).flatMap((item) =>
        convertListItem(item, "number"),
      );
    case "horizontalRule":
      return [{ _type: "divider", _key: createKey() }];
    case STRUCTURED_IMAGE_NODE_NAME: {
      const attrs = StructuredImageNodeAttrsSchema.safeParse(nodeAttrs(node));
      if (!attrs.success) return [];
      return [
        {
          _type: "image",
          _key: createKey(),
          mediaId: attrs.data.mediaId,
          alt: attrs.data.alt || undefined,
          caption: plainTextToSpans(attrs.data.caption),
        },
      ];
    }
    case STRUCTURED_EMBED_NODE_NAME: {
      const attrs = StructuredEmbedNodeAttrsSchema.safeParse(nodeAttrs(node));
      if (!attrs.success) return [];
      return [
        {
          _type: "embed",
          _key: createKey(),
          provider: attrs.data.provider,
          url: attrs.data.url,
        },
      ];
    }
    default:
      return [];
  }
}

export function serializeTiptapToStructuredText(
  doc: JSONContent,
): StructuredTextDocument {
  const blocks = (doc.content ?? []).flatMap(convertNode).filter((block) => {
    if (block._type !== "block") return true;
    return block.children.some((child) => child.text.trim().length > 0);
  });

  return StructuredTextDocumentSchema.parse(blocks);
}

function spanMarksToTiptap(
  span: StructuredTextSpan,
  markDefs: readonly StructuredTextMarkDef[],
): TiptapMark[] {
  return span.marks.map((mark) => {
    const markDef = markDefs.find((candidate) => candidate._key === mark);
    if (markDef?._type === "link") {
      return {
        type: "link",
        attrs: {
          href: markDef.href,
          target: markDef.openInNewTab ? "_blank" : null,
          rel: markDef.openInNewTab ? "noopener noreferrer nofollow" : null,
        },
      };
    }
    if (mark === "strong" || mark === "bold") return { type: "bold" };
    if (mark === "em" || mark === "italic") return { type: "italic" };
    if (mark === "strike") return { type: "strike" };
    if (mark === "code") return { type: "code" };
    return { type: mark };
  });
}

function blockContentToTiptap(block: TextBlock): JSONContent[] {
  return block.children.flatMap((span) => {
    const marks = spanMarksToTiptap(span, block.markDefs);
    const segments = span.text.split("\n");
    return segments.flatMap((text, index) => [
      ...(text.length > 0 ? [{ type: "text", text, marks }] : []),
      ...(index < segments.length - 1 ? [{ type: "hardBreak" }] : []),
    ]);
  });
}

function textBlockToTiptap(block: TextBlock): JSONContent {
  const content = blockContentToTiptap(block);
  if (block.listItem) {
    return {
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content,
        },
      ],
    };
  }
  if (block.style === "h2" || block.style === "h3" || block.style === "h4") {
    return {
      type: "heading",
      attrs: { level: Number(block.style.at(1)) },
      content,
    };
  }
  if (block.style === "blockquote") {
    return {
      type: "blockquote",
      content: [{ type: "paragraph", content }],
    };
  }
  return { type: "paragraph", content };
}

function appendListBlock(
  content: JSONContent[],
  block: TextBlock,
  listType: "bulletList" | "orderedList",
): void {
  const last = content.at(-1);
  if (last?.type === listType) {
    last.content = [...(last.content ?? []), textBlockToTiptap(block)];
    return;
  }

  content.push({
    type: listType,
    content: [textBlockToTiptap(block)],
  });
}

export function deserializeStructuredTextToTiptap(
  input: unknown,
): JSONContent {
  const document = StructuredTextDocumentSchema.parse(input);
  const content: JSONContent[] = [];

  for (const block of document) {
    if (block._type === "block" && block.listItem === "bullet") {
      appendListBlock(content, block, "bulletList");
      continue;
    }
    if (block._type === "block" && block.listItem === "number") {
      appendListBlock(content, block, "orderedList");
      continue;
    }
    if (block._type === "block") {
      content.push(textBlockToTiptap(block));
      continue;
    }
    if (block._type === "divider") {
      content.push({ type: "horizontalRule" });
      continue;
    }
    if (block._type === "image") {
      content.push({
        type: STRUCTURED_IMAGE_NODE_NAME,
        attrs: StructuredImageNodeAttrsSchema.parse({
          mediaId: block.mediaId,
          alt: block.alt ?? "",
          caption: spansToPlainText(block.caption),
        }),
      });
      continue;
    }
    if (block._type === "embed") {
      content.push({
        type: STRUCTURED_EMBED_NODE_NAME,
        attrs: StructuredEmbedNodeAttrsSchema.parse({
          provider: block.provider,
          url: block.url,
        }),
      });
    }
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}
