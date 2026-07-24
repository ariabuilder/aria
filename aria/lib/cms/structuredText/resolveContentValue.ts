import { StructuredTextDocumentSchema } from "./schemas";
import { renderStructuredTextToHtml } from "./renderToHtml";

export function tryRenderStructuredTextContent(value: unknown): string | null {
  const parsed = StructuredTextDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  return renderStructuredTextToHtml(parsed.data);
}

export function resolveRenderableContentValue(
  value: unknown,
  fallback = "",
): string {
  if (typeof value === "string") {
    return value;
  }

  if (value == null) {
    return fallback;
  }

  const structuredContent = tryRenderStructuredTextContent(value);
  if (structuredContent !== null) {
    return structuredContent;
  }

  return String(value);
}
