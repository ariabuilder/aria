/**
 * Scores imported node trees to detect tokenized / source-code paste failures.
 * Uses multi-factor analysis combining structural, content, and pattern signals to distinguish.
 */

import type { BuilderNode } from "../types/nodes";

/** Text that looks like an HTML/XML tag fragment or attribute assignment. */
const TAG_LIKE_TEXT_PATTERN = /^[\s]*(?:[<\/>!]|&lt;|[\w-]+=)/;

/** Full document / page markup headers. */
const DOCUMENT_MARKUP_PATTERN = /<!DOCTYPE|<html\b/i;

/** HTML entity references surviving in decoded text — a strong code signal. */
const HTML_ENTITY_PATTERN = /&(?:lt|gt|amp|quot|#39|#x27|#x2F|#x3D);/i;

/** Programming-language constructs unlikely in natural HTML content. */
const CODE_PATTERN =
  /\b(?:const\s+\w+|let\s+\w+|var\s+\w+|function\s+\w*\(|=>|console\.|require\s*\(|module\.exports|import\s+['"{])/;

/**
 * Semantically strong structural elements.
 * Presence of these is a high-confidence signal for a legitimate layout.
 */
const STRUCTURAL_TYPES = new Set([
  "section",
  "heading",
  "button",
  "image",
  "list",
  "link",
  "svg",
  "video",
  "form",
  "article",
  "header",
  "footer",
  "nav",
  "main",
]);

/**
 * Common block-level container types.
 * These provide structural shape but carry less semantic weight.
 */
const BLOCK_TYPES = new Set(["container", "paragraph", "listitem"]);

export interface ImportQualityMetrics {
  /** Composite score: positive = good layout, negative = likely code. */
  score: number;
  spanCount: number;
  /** Span nodes whose text looks like HTML/XML tag fragments. */
  tagLikeSpanCount: number;
  /** Nodes matching STRUCTURAL_TYPES. */
  structuralCount: number;
  maxDepth: number;
  isTokenized: boolean;
  /** Nodes matching BLOCK_TYPES. */
  blockCount: number;
  totalNodeCount: number;
  nodeTypeCount: number;
  /** Span nodes whose text matches programming code patterns. */
  codePatternSpanCount: number;
  /** Span nodes containing natural language text (not tag-like, has word chars). */
  naturalTextSpanCount: number;
}

function getNodeTypeKey(type: string | undefined): string {
  return (type ?? "").toLowerCase();
}

function getNodeText(node: BuilderNode): string {
  const props = node.props ?? {};
  if (typeof props.text === "string") return props.text;
  if (typeof props.content === "string") return props.content;
  return "";
}

/**
 * Returns true when text contains common English words or sentence-like content.
 * Used to distinguish natural language from code fragments.
 */
function looksLikeNaturalText(text: string): boolean {
  if (text.length < 2) return false;

  // Must have actual English words (3+ letters)
  const hasWords = /[a-zA-Z]{3,}/.test(text);

  // Must not look like a tag/attribute fragment
  const noTagLikeStart = !TAG_LIKE_TEXT_PATTERN.test(text);

  // Must not match code patterns — source code fragments like
  // "const x = 5;" or "console.log()" have English letters too.
  const noCodePatterns =
    !CODE_PATTERN.test(text) && !HTML_ENTITY_PATTERN.test(text);

  return hasWords && noTagLikeStart && noCodePatterns;
}

/**
 * Returns true when text contains programming code patterns
 * not typical in natural HTML content.
 */
function looksLikeCodeText(text: string): boolean {
  if (!text) return false;

  if (CODE_PATTERN.test(text)) return true;

  // HTML entities in decoded text — very strong code signal
  if (HTML_ENTITY_PATTERN.test(text)) return true;

  return false;
}

interface WalkMetrics {
  spanCount: number;
  tagLikeSpanCount: number;
  structuralCount: number;
  blockCount: number;
  maxDepth: number;
  totalNodeCount: number;
  nodeTypes: Set<string>;
  hasDocumentTextBlob: boolean;
  codePatternSpanCount: number;
  naturalTextSpanCount: number;
}

function walkNodes(nodes: BuilderNode[], depth: number, m: WalkMetrics): void {
  for (const node of nodes) {
    const typeKey = getNodeTypeKey(node.type);
    const nextDepth = depth + 1;
    m.maxDepth = Math.max(m.maxDepth, nextDepth);
    m.totalNodeCount += 1;
    m.nodeTypes.add(typeKey);

    // -- Span / Text leaf analysis -------------------------------------------
    if (typeKey === "span" || typeKey === "text") {
      m.spanCount += 1;
      const text = getNodeText(node);

      if (text) {
        // Tag-like fragments (e.g. "<div", 'class="foo"')
        if (TAG_LIKE_TEXT_PATTERN.test(text)) {
          m.tagLikeSpanCount += 1;
        }

        if (looksLikeCodeText(text)) {
          m.codePatternSpanCount += 1;
        }

        if (looksLikeNaturalText(text)) {
          m.naturalTextSpanCount += 1;
        }
      }
    }

    // -- Structural accounting -----------------------------------------------
    if (STRUCTURAL_TYPES.has(typeKey)) {
      m.structuralCount += 1;
    }

    if (BLOCK_TYPES.has(typeKey)) {
      m.blockCount += 1;
    }

    // -- Large text blob detection -------------------------------------------
    const text = getNodeText(node);
    if (
      (typeKey === "span" ||
        typeKey === "container" ||
        typeKey === "section") &&
      text.length > 200 &&
      text.trimStart().startsWith("<")
    ) {
      m.hasDocumentTextBlob = true;
    }

    if (text && DOCUMENT_MARKUP_PATTERN.test(text)) {
      m.hasDocumentTextBlob = true;
    }

    // -- Recurse -------------------------------------------------------------
    if (node.children?.length) {
      walkNodes(node.children, nextDepth, m);
    }
  }
}

export function scoreImportedNodeTree(
  nodes: BuilderNode[],
): ImportQualityMetrics {
  const m: WalkMetrics = {
    spanCount: 0,
    tagLikeSpanCount: 0,
    structuralCount: 0,
    blockCount: 0,
    maxDepth: 0,
    totalNodeCount: 0,
    nodeTypes: new Set(),
    hasDocumentTextBlob: false,
    codePatternSpanCount: 0,
    naturalTextSpanCount: 0,
  };

  // Empty tree → always tokenized
  if (nodes.length === 0) {
    return {
      score: Number.NEGATIVE_INFINITY,
      spanCount: 0,
      tagLikeSpanCount: 0,
      structuralCount: 0,
      maxDepth: 0,
      isTokenized: true,
      blockCount: 0,
      totalNodeCount: 0,
      nodeTypeCount: 0,
      codePatternSpanCount: 0,
      naturalTextSpanCount: 0,
    };
  }

  walkNodes(nodes, 0, m);

  const tagLikeSpanRatio =
    m.spanCount > 0 ? m.tagLikeSpanCount / m.spanCount : 0;

  // -- Tokenization verdict --------------------------------------------------
  //
  // Condition A: A single node contains a massive raw-HTML text blob.
  //   This is nearly always a paste of unprocessed source markup.
  //
  // Condition B: Enough spans carry tag-like text to rule out coincidence.
  //   The 35 % / 3-span threshold catches tokenized attribute soup.
  //
  // Condition C: All spans have tag-like text but there is no structural or
  //   block backbone.  Catches tiny code fragments pasted without context.
  //   (Requires tagLikeSpanRatio > 0 so plain-text spans don't trigger it.)
  //
  // Condition D: Programming code patterns detected and the tree lacks any
  //   real structural skeleton.  Catches e.g. `const x = 5;` or `=>` pastes.
  //
  // Overrides:
  //   - Natural-text spans can override code-like signals when the tree
  //     has a structural or block backbone (a docs page with code samples).
  //   - A rich type-diverse tree with blocks is very unlikely to be tokenized
  //     source code, regardless of a few suspicious spans.

  const hasCodePatterns = m.codePatternSpanCount > 0;
  const hasNaturalText = m.naturalTextSpanCount > 0;
  const hasStructure = m.structuralCount > 0 || m.blockCount > 0;

  const isTokenized =
    // -- Condition A: massive raw-HTML blob ----------------------------------
    m.hasDocumentTextBlob ||
    // -- Condition B: tokenized span soup ------------------------------------
    (m.spanCount >= 3 && tagLikeSpanRatio > 0.35) ||
    // -- Condition C: structural desert with tag-like spans ------------------
    (m.structuralCount === 0 &&
      m.spanCount > 0 &&
      tagLikeSpanRatio > 0 &&
      m.blockCount === 0) ||
    // -- Condition D: code patterns dominate with no structural backbone ----
    (hasCodePatterns &&
      !hasStructure &&
      m.codePatternSpanCount >= m.naturalTextSpanCount &&
      m.spanCount > 0) ||
    // -- Condition E: very high tag-like density, no natural text -----------
    (tagLikeSpanRatio >= 0.8 &&
      m.structuralCount === 0 &&
      m.naturalTextSpanCount === 0 &&
      m.spanCount > 0);

  // -- Scoring ----------------------------------------------------------------
  //
  // Positive contributions:
  //   structuralCount × 15   — strong semantic elements
  //   blockCount × 5          — container / paragraph scaffolding
  //   maxDepth × 5            — tree depth is a strong layout signal
  //   nodeTypeCount × 4       — type diversity suggests real content
  //   naturalTextSpanCount × 2 — natural language is anti-code
  //
  // Negative contributions:
  //   tagLikeSpanCount × 20   — each tag-like fragment is suspicious
  //   codePatternSpanCount × 25 — each code pattern is very suspicious
  //   tagLikeSpanRatio × 120  — high density of tag-like text is very bad

  let score = 0;
  score += m.structuralCount * 15;
  score += m.blockCount * 5;
  score += m.maxDepth * 5;
  score += m.nodeTypes.size * 4;
  score += m.naturalTextSpanCount * 2;

  score -= m.tagLikeSpanCount * 20;
  score -= m.codePatternSpanCount * 25;
  score -= Math.round(tagLikeSpanRatio * 120);

  // Natural text override: if the tree has meaningful natural text AND
  // block/structure backing, it is a legitimate layout; prevent score
  // from going deeply negative from a few suspicious spans.
  if (
    hasNaturalText &&
    hasStructure &&
    m.naturalTextSpanCount >= m.tagLikeSpanCount
  ) {
    score = Math.max(score, -20);
  }

  if (m.hasDocumentTextBlob) {
    score = Number.NEGATIVE_INFINITY;
  }

  if (isTokenized) {
    score = Math.min(score, -100);
  }

  return {
    score,
    spanCount: m.spanCount,
    tagLikeSpanCount: m.tagLikeSpanCount,
    structuralCount: m.structuralCount,
    maxDepth: m.maxDepth,
    isTokenized,
    blockCount: m.blockCount,
    totalNodeCount: m.totalNodeCount,
    nodeTypeCount: m.nodeTypes.size,
    codePatternSpanCount: m.codePatternSpanCount,
    naturalTextSpanCount: m.naturalTextSpanCount,
  };
}

/**
 * Returns true when the node tree is classified as tokenized source code.
 * Simple boolean wrapper around scoreImportedNodeTree.
 */
export function detectTokenizedMarkupImport(nodes: BuilderNode[]): boolean {
  return scoreImportedNodeTree(nodes).isTokenized;
}
