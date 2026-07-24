import { z } from "zod";
import { slugify } from "../utils/slugify";
import {
  WordPressImportCountsSchema,
  type WordPressImportCounts,
  type WordPressImportSourceType,
} from "./schemas";

export type WordPressSourceKind =
  | "author"
  | "post"
  | "page"
  | "custom-post-type"
  | "attachment"
  | "term"
  | "comment"
  | "menu-item"
  | "option"
  | "builder-data";

export interface WordPressSourceMeta {
  key: string;
  value: string;
}

export interface WordPressSourceTerm {
  domain: string;
  slug: string;
  name: string;
}

export interface WordPressSourceAuthor {
  id: string;
  login: string;
  email?: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
}

export interface WordPressSourceItem {
  id: string;
  kind: WordPressSourceKind;
  postType?: string;
  title: string;
  slug: string;
  status?: string;
  date?: string;
  modified?: string;
  authorLogin?: string;
  content?: string;
  attachmentUrl?: string;
  excerpt?: string;
  meta: WordPressSourceMeta[];
  terms: WordPressSourceTerm[];
  sourceChecksum: string;
  builderDropped: boolean;
  builderReasons: string[];
}

export interface WordPressSourceGraph {
  sourceType: WordPressImportSourceType;
  site: {
    title?: string;
    link?: string;
    homeUrl?: string;
    siteUrl?: string;
    wpVersion?: string;
    tablePrefix?: string;
  };
  items: WordPressSourceItem[];
  authors: WordPressSourceAuthor[];
  terms: WordPressSourceTerm[];
  counts: WordPressImportCounts;
  warnings: string[];
  applySupported: boolean;
}

const BUILDER_META_KEYS = new Set([
  "_elementor_data",
  "_elementor_css",
  "_elementor_edit_mode",
  "_bricks_page_content",
  "_bricks_page_header_2",
  "_bricks_page_footer_2",
  "ct_builder_shortcodes",
  "_ct_builder_shortcodes",
  "_oxygen_builder_data",
  "_fl_builder_data",
  "_fl_builder_draft",
  "_wpb_shortcodes_custom_css",
]);

const BUILDER_CONTENT_PATTERNS = [
  /\[vc_row\b/i,
  /\[et_pb_/i,
  /\[ux_builder\b/i,
  /\[fl_builder\b/i,
  /\[oxygen\b/i,
  /\[elementor-template\b/i,
];

const IGNORED_POST_TYPES = new Set([
  "custom_css",
  "customize_changeset",
  "oembed_cache",
  "table",
  "tables",
  "tablepress_table",
  "revision",
  "user_request",
  "wp_block",
  "wp_font_face",
  "wp_font_family",
  "wp_global_styles",
  "wp_navigation",
  "wp_table",
  "wp_template",
  "wp_template_part",
]);

const IGNORED_TERM_DOMAINS = new Set([
  "nav_menu",
  "wp_theme",
  "wp_template_part_area",
]);

const CLEAN_META_DENY_PREFIXES = ["_", "rank_math_", "_yoast_", "_aioseo_"];

function textValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record.__cdata ?? record["#text"] ?? record.text);
  }
  return "";
}

function arrayValue<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textArrayValue(value: unknown): string[] {
  return arrayValue(value).map(textValue).filter(Boolean);
}

function attrValue(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  return textValue(record[`@_${key}`] ?? record[key]);
}

function sourceChecksum(input: unknown): string {
  const text = JSON.stringify(input);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function isBuilderMetaKey(key: string): boolean {
  return BUILDER_META_KEYS.has(key.trim());
}

export function isCleanCustomField(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) {
    return false;
  }
  return !CLEAN_META_DENY_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function isIgnoredPostType(postType: string): boolean {
  return IGNORED_POST_TYPES.has(postType.trim().toLowerCase());
}

function isIgnoredTermDomain(domain: string): boolean {
  return IGNORED_TERM_DOMAINS.has(domain.trim().toLowerCase());
}

function detectBuilderContent(content: string): string[] {
  const reasons: string[] = [];
  for (const pattern of BUILDER_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      reasons.push(`builder shortcode ${pattern.source}`);
    }
  }
  return reasons;
}

function normalizePostType(postType: string): WordPressSourceKind {
  if (postType === "post") return "post";
  if (postType === "page") return "page";
  if (postType === "attachment") return "attachment";
  if (postType === "nav_menu_item") return "menu-item";
  return "custom-post-type";
}

function postTypeToCollectionName(postType: string): string {
  if (postType === "post") return "posts";
  if (postType === "page") return "pages";
  return slugify(postType.endsWith("s") ? postType : `${postType}s`) || "items";
}

export function collectionNameForWordPressItem(item: WordPressSourceItem): string {
  return postTypeToCollectionName(item.postType ?? "post");
}

export function countCleanCustomFields(items: WordPressSourceItem[]): number {
  let total = 0;
  for (const item of items) {
    total += item.meta.filter((meta) => isCleanCustomField(meta.key)).length;
  }
  return total;
}

function normalizeAuthor(rawAuthor: Record<string, unknown>): WordPressSourceAuthor {
  const login = textValue(rawAuthor.author_login) || textValue(rawAuthor.login);
  const displayName =
    textValue(rawAuthor.author_display_name) ||
    textValue(rawAuthor.display_name) ||
    login ||
    "WordPress Author";
  return {
    id: login || textValue(rawAuthor.author_id) || displayName,
    login,
    email: textValue(rawAuthor.author_email) || undefined,
    displayName,
    firstName: textValue(rawAuthor.author_first_name) || undefined,
    lastName: textValue(rawAuthor.author_last_name) || undefined,
  };
}

function uniqueTerms(items: WordPressSourceItem[]): WordPressSourceTerm[] {
  const terms = new Map<string, WordPressSourceTerm>();
  for (const term of items.flatMap((item) => item.terms)) {
    const key = `${term.domain}:${term.slug || slugify(term.name)}`;
    if (!terms.has(key)) {
      terms.set(key, {
        ...term,
        slug: term.slug || slugify(term.name),
      });
    }
  }
  return Array.from(terms.values());
}

export async function parseWxrSource(input: string): Promise<WordPressSourceGraph> {
  const { XMLParser } = (await import("fast-xml-parser")) as {
    XMLParser: new (options?: Record<string, unknown>) => {
      parse: (input: string) => unknown;
    };
  };

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    cdataPropName: "__cdata",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: false,
    isArray: (name: string) =>
      ["item", "author", "category", "tag", "term", "postmeta", "comment"].includes(
        name,
      ),
  });

  const parsed = parser.parse(input) as Record<string, unknown>;
  const channel = ((parsed.rss as Record<string, unknown> | undefined)
    ?.channel ?? parsed.channel ?? {}) as Record<string, unknown>;
  const rawItems = arrayValue(channel.item as Record<string, unknown>[]);
  const authors = arrayValue(channel.author as Record<string, unknown>[]).map(
    normalizeAuthor,
  );
  const items: WordPressSourceItem[] = [];

  for (const rawItem of rawItems) {
    const postType = textValue(rawItem.post_type) || "post";
    if (isIgnoredPostType(postType)) {
      continue;
    }
    const kind = normalizePostType(postType);
    const id = textValue(rawItem.post_id) || textValue(rawItem.guid) || crypto.randomUUID();
    const meta = arrayValue(rawItem.postmeta as Record<string, unknown>[]).map(
      (entry): WordPressSourceMeta => ({
        key: textValue(entry.meta_key),
        value: textValue(entry.meta_value),
      }),
    );
    const encodedValues = textArrayValue(rawItem.encoded);
    const content = encodedValues[0] ?? textValue(rawItem.content);
    const builderReasons = [
      ...meta
        .filter((entry) => isBuilderMetaKey(entry.key))
        .map((entry) => `builder meta ${entry.key}`),
      ...detectBuilderContent(content),
    ];
    const builderDropped = builderReasons.length > 0;
    const title = textValue(rawItem.title) || "(Untitled)";
    const slug = slugify(textValue(rawItem.post_name) || title || id) || `item-${id}`;
    const terms = arrayValue(rawItem.category as Record<string, unknown>[])
      .map((term): WordPressSourceTerm => {
        const domain = attrValue(term, "domain") || "category";
        return {
          domain,
          slug: slugify(attrValue(term, "nicename") || textValue(term)),
          name: textValue(term),
        };
      })
      .filter((term) => !isIgnoredTermDomain(term.domain));

    items.push({
      id,
      kind,
      postType,
      title,
      slug,
      status: textValue(rawItem.status),
      date: textValue(rawItem.post_date_gmt || rawItem.pubDate),
      modified: textValue(rawItem.post_modified_gmt),
      authorLogin: textValue(rawItem.creator),
      content: builderDropped ? "" : content,
      attachmentUrl: textValue(rawItem.attachment_url),
      excerpt: textValue(rawItem.encoded_1) || encodedValues[1] || textValue(rawItem.excerpt),
      meta,
      terms,
      sourceChecksum: sourceChecksum(rawItem),
      builderDropped,
      builderReasons,
    });
  }

  const terms = uniqueTerms(items);
  const counts = WordPressImportCountsSchema.parse({
    posts: items.filter((item) => item.kind === "post").length,
    pages: items.filter((item) => item.kind === "page").length,
    customPostTypes: items.filter((item) => item.kind === "custom-post-type").length,
    attachments: items.filter((item) => item.kind === "attachment").length,
    authors: authors.length,
    comments: items.reduce(
      (count, item) =>
        count + arrayValue((rawItems.find((raw) => textValue(raw.post_id) === item.id) as Record<string, unknown> | undefined)?.comment as unknown[]).length,
      0,
    ),
    terms: terms.length,
    menus: items.filter((item) => item.kind === "menu-item").length,
    skippedBuilderItems: items.filter((item) => item.builderDropped).length,
    cleanCustomFields: countCleanCustomFields(items),
    seoFields: items.reduce(
      (count, item) =>
        count +
        item.meta.filter((meta) =>
          /^(_yoast_|rank_math_|_aioseo_)/.test(meta.key.trim()),
        ).length,
      0,
    ),
  });

  return {
    sourceType: "wxr",
    site: {
      title: textValue(channel.title),
      link: textValue(channel.link),
      homeUrl: textValue(channel.base_site_url),
      siteUrl: textValue(channel.base_blog_url),
      wpVersion: textValue(channel.wxr_version),
    },
    items,
    authors,
    terms,
    counts,
    warnings: [
      ...(counts.skippedBuilderItems > 0
        ? [`Dropped builder content from ${counts.skippedBuilderItems} item(s).`]
        : []),
      ...(counts.comments > 0
        ? [
            `Found ${counts.comments} comment(s). Comments are deferred until Aria has comments support.`,
          ]
        : []),
    ],
    applySupported: true,
  };
}

export async function extractImportSource(input: {
  filename: string;
  bytes: Uint8Array;
}): Promise<{ sourceType: "wxr"; filename: string; text: string }> {
  const lower = input.filename.toLowerCase();
  if (!lower.endsWith(".xml") && !lower.endsWith(".wxr")) {
    throw new Error("Upload a WordPress WXR/XML export file.");
  }
  const text = new TextDecoder().decode(input.bytes);
  if (!/<rss[\s>]/i.test(text) && !/<channel[\s>]/i.test(text)) {
    throw new Error("Upload a valid WordPress WXR/XML export file.");
  }
  return { sourceType: "wxr", filename: input.filename, text };
}

export async function parseWordPressSource(input: {
  sourceType: WordPressImportSourceType;
  text: string;
}): Promise<WordPressSourceGraph> {
  if (input.sourceType === "wxr") {
    return parseWxrSource(input.text);
  }
  throw new Error("Only WordPress WXR/XML exports are supported in this version.");
}

export const WordPressSourceGraphSchema = z.custom<WordPressSourceGraph>();
