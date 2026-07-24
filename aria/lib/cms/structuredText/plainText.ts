import { generateId } from "../../crypto";
import {
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
} from "./schemas";

function createStructuredTextKey(): string {
  return generateId();
}

export function plainTextToStructuredText(text: string): StructuredTextDocument {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return StructuredTextDocumentSchema.parse([
    {
      _type: "block",
      _key: createStructuredTextKey(),
      style: "normal",
      markDefs: [],
      children: [
        {
          _type: "span",
          _key: createStructuredTextKey(),
          text: trimmed,
          marks: [],
        },
      ],
    },
  ]);
}

export function structuredTextToPlainText(body: unknown): string {
  if (body == null) {
    return "";
  }

  const parsed = StructuredTextDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return "";
  }

  return parsed.data
    .flatMap((block) => {
      if (block._type !== "block") {
        return [];
      }
      return block.children.map((child) => child.text);
    })
    .join("\n")
    .trim();
}
