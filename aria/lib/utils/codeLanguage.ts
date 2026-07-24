export type InferredCodeLanguage = "javascript" | "html" | "css" | "json";
export type CodeBlockRenderMode = "display" | "render";

const HTML_TAG_PATTERN = /<\/?[a-z][\w:-]*(\s[^>]*)?>/i;
const CSS_BLOCK_PATTERN =
  /(^|\n)\s*([.#@]?[a-z][\w\s,:>+~\-[\]="']*)\s*\{[\s\S]*\}\s*$/i;

export function inferCodeLanguage(value: unknown): InferredCodeLanguage {
  const source = typeof value === "string" ? value.trim() : "";

  if (!source) {
    return "javascript";
  }

  if (HTML_TAG_PATTERN.test(source)) {
    return "html";
  }

  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      JSON.parse(source);
      return "json";
    } catch {
      // Fall through to the next heuristic.
    }
  }

  if (CSS_BLOCK_PATTERN.test(source)) {
    return "css";
  }

  return "javascript";
}

export function getCodeBlockRenderMode(value: unknown): CodeBlockRenderMode {
  return value === "render" ? "render" : "display";
}

export function buildRenderedCodeMarkup(value: unknown): string {
  const source = typeof value === "string" ? value.trim() : "";

  if (!source) {
    return "";
  }

  const language = inferCodeLanguage(source);

  if (language === "javascript" && !/<script\b/i.test(source)) {
    return `<script>${source}</script>`;
  }

  if (language === "css" && !/<style\b/i.test(source)) {
    return `<style>${source}</style>`;
  }

  return source;
}
