/**
 * Chooses which clipboard flavor to import as HTML. code editors often put source files
 * on the clipboard as `text/html` wrapped in a single `<pre>` (escaped markup), while.
 */

import type { BuilderNode } from "../../../../lib/types/nodes";
import {
  importHtmlToNodes as importHtmlToNodesDefault,
  type HtmlToNodesImportResult,
} from "../../../../lib/blocks/htmlToNodes";
import {
  detectTokenizedMarkupImport,
  scoreImportedNodeTree,
} from "../../../../lib/blocks/pasteImportQuality";

export type ImportHtmlToNodesFn = (
  html: string,
  importDepth?: number,
) => Promise<HtmlToNodesImportResult>;

export function isLikelyHtmlClipboard(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

export function stripBom(markup: string): string {
  return markup.replace(/^\uFEFF/, "");
}

function countHtmlOpenTags(markup: string): number {
  return (markup.match(/<[a-z][\w:-]*\b/gi) ?? []).length;
}

function decodeHtmlEntities(text: string): string {
  if (typeof document === "undefined") {
    return text
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

function getImportableBodyElements(html: string): Element[] {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.body.children);
}

function findEditorSourceWrapper(
  elements: Element[],
): HTMLPreElement | HTMLElement | null {
  if (elements.length !== 1) {
    return null;
  }

  const walk = (element: Element): HTMLPreElement | HTMLElement | null => {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "pre" || tagName === "code") {
      return element as HTMLPreElement | HTMLElement;
    }

    if (tagName === "div" || tagName === "span" || tagName === "p") {
      const elementChildren = Array.from(element.children);
      if (elementChildren.length === 1) {
        return walk(elementChildren[0]!);
      }
    }

    return null;
  };

  return walk(elements[0]!);
}

function markupLooksLikeSourceInWrapper(
  plain: string,
  wrapper: HTMLElement,
): boolean {
  const wrapperText = wrapper.textContent?.trim() ?? "";
  if (!wrapperText) {
    return false;
  }

  const normalizedPlain = plain.replace(/\s+/g, " ");
  const normalizedWrapperText = wrapperText.replace(/\s+/g, " ");

  if (
    normalizedPlain.includes(normalizedWrapperText) ||
    normalizedWrapperText.includes(normalizedPlain)
  ) {
    return true;
  }

  const decodedWrapper = decodeHtmlEntities(wrapperText).replace(/\s+/g, " ");
  return (
    normalizedPlain.includes(decodedWrapper) ||
    decodedWrapper.includes(normalizedPlain)
  );
}

/**
 * True when `text/html` is an editor-style source wrapper but `text/plain` is real markup.
 */
export function shouldPreferPlainClipboardHtml(
  plain: string,
  html: string,
): boolean {
  const normalizedPlain = stripBom(plain).trim();
  const normalizedHtml = html.trim();

  if (!normalizedPlain || !normalizedHtml) {
    return false;
  }

  if (!isLikelyHtmlClipboard(normalizedPlain)) {
    return false;
  }

  if (!isLikelyHtmlClipboard(normalizedHtml)) {
    return false;
  }

  const sourceWrapper = findEditorSourceWrapper(
    getImportableBodyElements(normalizedHtml),
  );
  if (!sourceWrapper) {
    return false;
  }

  if (!markupLooksLikeSourceInWrapper(normalizedPlain, sourceWrapper)) {
    return false;
  }

  const plainTagCount = countHtmlOpenTags(normalizedPlain);
  const decodedWrapperTagCount = countHtmlOpenTags(
    decodeHtmlEntities(sourceWrapper.textContent ?? ""),
  );

  return plainTagCount >= decodedWrapperTagCount && plainTagCount > 0;
}

/** Extract Office / browser clipboard fragment between StartFragment markers. */
export function extractClipboardFragment(html: string): string {
  const start = html.indexOf("<!--StartFragment-->");
  const end = html.indexOf("<!--EndFragment-->");

  if (start === -1) {
    return html;
  }

  const fragmentStart = start + "<!--StartFragment-->".length;
  const fragmentEnd = end === -1 ? html.length : end;
  return html.slice(fragmentStart, fragmentEnd).trim();
}

/** Unwrap single pre/code (or wrapper chain) containing HTML source text. */
export function unwrapEditorSourceHtml(html: string): string | null {
  const fragment = extractClipboardFragment(html);
  const sourceWrapper = findEditorSourceWrapper(
    getImportableBodyElements(fragment),
  );

  if (!sourceWrapper) {
    return null;
  }

  const decoded = decodeHtmlEntities(
    sourceWrapper.textContent ?? "",
  ).trim();

  return isLikelyHtmlClipboard(decoded) ? decoded : null;
}

export interface ClipboardMarkupOptions {
  clipboardText?: string;
  clipboardHtml?: string;
}

export interface MarkupCandidate {
  id: string;
  markup: string;
}

function uniqueCandidates(candidates: MarkupCandidate[]): MarkupCandidate[] {
  const seen = new Set<string>();
  const result: MarkupCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.markup.replace(/\s+/g, " ");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

export function buildMarkupCandidates(
  options?: ClipboardMarkupOptions,
  navigator?: { plain: string; html: string },
): MarkupCandidate[] {
  const plain = stripBom(options?.clipboardText?.trim() ?? navigator?.plain ?? "");
  const html = options?.clipboardHtml?.trim() ?? navigator?.html ?? "";

  const candidates: MarkupCandidate[] = [];

  if (plain && isLikelyHtmlClipboard(plain)) {
    candidates.push({ id: "plain", markup: plain });
  }

  if (html && isLikelyHtmlClipboard(html)) {
    candidates.push({ id: "html", markup: html });
    const fragment = extractClipboardFragment(html);
    if (fragment !== html) {
      candidates.push({ id: "fragment", markup: fragment });
    }
    const unwrapped = unwrapEditorSourceHtml(html);
    if (unwrapped) {
      candidates.push({ id: "unwrapped", markup: unwrapped });
    }
  }

  return uniqueCandidates(candidates);
}

export interface PickBestMarkupResult {
  markup: string;
  nodes: BuilderNode[];
  report: HtmlToNodesImportResult["report"];
  candidateId: string;
}

export async function pickBestMarkupForImport(
  candidates: MarkupCandidate[],
  importHtml: ImportHtmlToNodesFn = importHtmlToNodesDefault,
): Promise<PickBestMarkupResult | null> {
  if (candidates.length === 0) {
    return null;
  }

  let best: PickBestMarkupResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const imported = await importHtml(candidate.markup);
    if (imported.nodes.length === 0) {
      continue;
    }

    const quality = scoreImportedNodeTree(imported.nodes);
    if (quality.isTokenized) {
      continue;
    }

    if (quality.score > bestScore) {
      bestScore = quality.score;
      best = {
        markup: candidate.markup,
        nodes: imported.nodes,
        report: imported.report,
        candidateId: candidate.id,
      };
    }
  }

  if (best) {
    return best;
  }

  // Fallback: best scoring even if tokenized (caller may abort)
  for (const candidate of candidates) {
    const imported = await importHtml(candidate.markup);
    const quality = scoreImportedNodeTree(imported.nodes);
    if (quality.score > bestScore && imported.nodes.length > 0) {
      bestScore = quality.score;
      best = {
        markup: candidate.markup,
        nodes: imported.nodes,
        report: imported.report,
        candidateId: candidate.id,
      };
    }
  }

  return best;
}

export async function resolveClipboardMarkup(
  readClipboardText: () => Promise<string>,
  readClipboardHtml: () => Promise<string>,
  options?: ClipboardMarkupOptions,
  importHtml: ImportHtmlToNodesFn = importHtmlToNodesDefault,
): Promise<string> {
  const clipboardText = stripBom(options?.clipboardText?.trim() ?? "");
  const clipboardHtml = options?.clipboardHtml?.trim() ?? "";

  if (clipboardText || clipboardHtml) {
    const candidates = buildMarkupCandidates({
      clipboardText,
      clipboardHtml,
    });
    if (candidates.length === 1) {
      return candidates[0]!.markup;
    }
    if (candidates.length > 1) {
      const best = await pickBestMarkupForImport(candidates, importHtml);
      if (best) {
        return best.markup;
      }
    }

    if (
      clipboardText &&
      clipboardHtml &&
      shouldPreferPlainClipboardHtml(clipboardText, clipboardHtml)
    ) {
      return clipboardText;
    }

    if (isLikelyHtmlClipboard(clipboardHtml)) {
      const unwrapped = unwrapEditorSourceHtml(clipboardHtml);
      return unwrapped ?? clipboardHtml;
    }

    if (isLikelyHtmlClipboard(clipboardText)) {
      return clipboardText;
    }

    return clipboardHtml || clipboardText;
  }

  const navigatorHtml = (await readClipboardHtml()).trim();
  const navigatorText = stripBom((await readClipboardText()).trim());

  const candidates = buildMarkupCandidates(undefined, {
    plain: navigatorText,
    html: navigatorHtml,
  });

  if (candidates.length > 0) {
    const best = await pickBestMarkupForImport(candidates, importHtml);
    if (best) {
      return best.markup;
    }
    return candidates[0]!.markup;
  }

  return navigatorText || navigatorHtml;
}

export async function importHtmlFromClipboard(
  readClipboardText: () => Promise<string>,
  readClipboardHtml: () => Promise<string>,
  options?: ClipboardMarkupOptions,
  importHtml: ImportHtmlToNodesFn = importHtmlToNodesDefault,
): Promise<PickBestMarkupResult | null> {
  const eventPlain = stripBom(options?.clipboardText?.trim() ?? "");
  const eventHtml = options?.clipboardHtml?.trim() ?? "";

  if (eventPlain || eventHtml) {
    const candidates = buildMarkupCandidates({
      clipboardText: eventPlain,
      clipboardHtml: eventHtml,
    });
    return pickBestMarkupForImport(candidates, importHtml);
  }

  const navigatorHtml = (await readClipboardHtml()).trim();
  const navigatorText = stripBom((await readClipboardText()).trim());
  const candidates = buildMarkupCandidates(undefined, {
    plain: navigatorText,
    html: navigatorHtml,
  });

  return pickBestMarkupForImport(candidates, importHtml);
}

export { detectTokenizedMarkupImport, scoreImportedNodeTree };

export const HTML_PASTE_COMPLETE_EVENT = "aria:html-paste-complete";
