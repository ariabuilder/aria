import { marked, type Token } from "marked";
import { parseDocument } from "yaml";
import { z } from "zod";
import type { ActorRef } from "../../auth/types";
import { generateId } from "../../crypto";
import {
  LocaleCodeSchema,
  type ContentLocalizationSettings,
} from "../../localization/contentLocale";
import type { StorageAdapter } from "../../storage/adapter";
import { slugify } from "../../utils/slugify";
import type { FieldSchema } from "../fieldSchema";
import { validateEntryFrontmatter } from "../schema/compiler";
import { collectionSchemaForEntryFrontmatter } from "../systemFields";
import {
  StructuredTextDocumentSchema,
  type StructuredTextDocument,
  type StructuredTextMarkDef,
  type StructuredTextSpan,
} from "../structuredText/schemas";
import { CmsServiceError } from "../errors";
import { getCollectionFromAdapter } from "../services/collections";
import { updateCollectionOnAdapter } from "../services/collections";
import {
  createEntryOnAdapter,
  getContentLocaleSettings,
  updateEntryOnAdapter,
} from "../services/entries";
import {
  MarkdownImportApplyReportSchema,
  MarkdownImportApplyInputSchema,
  MarkdownImportPreviewInputSchema,
  MarkdownImportPreviewSchema,
  type MarkdownImportApplyReport,
  type MarkdownImportApplyInput,
  type MarkdownImportDiagnostic,
  type MarkdownImportItem,
  type MarkdownImportPreview,
  type MarkdownImportPreviewInput,
  type MarkdownImportSuggestedField,
  type MarkdownImportSource,
} from "./schemas";

const FrontmatterSchema = z.record(z.string().trim().min(1), z.unknown());
const RESERVED_KEYS = new Set(["title", "slug", "locale", "status", "body"]);

type ParsedDocument = {
  source: MarkdownImportSource;
  title: string | null;
  slug: string | null;
  locale: string | null;
  frontmatter: Record<string, unknown>;
  body: StructuredTextDocument | null;
  diagnostics: MarkdownImportDiagnostic[];
};

function diagnostic(
  source: MarkdownImportSource,
  code: string,
  severity: MarkdownImportDiagnostic["severity"],
  message: string,
  remediation?: string,
): MarkdownImportDiagnostic {
  return { code, severity, path: source.path, message, remediation };
}

function filenameStem(path: string): string {
  return (
    path
      .split("/")
      .at(-1)
      ?.replace(/\.mdx?$/i, "") ?? ""
  );
}

function splitFrontmatter(source: MarkdownImportSource): {
  frontmatterText: string | null;
  body: string;
} {
  const normalized = source.content.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatterText: null, body: normalized };
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing === -1) {
    return { frontmatterText: null, body: normalized };
  }
  return {
    frontmatterText: normalized.slice(4, closing),
    body: normalized.slice(closing + 5),
  };
}

function parseFrontmatter(source: MarkdownImportSource): {
  frontmatter: Record<string, unknown>;
  body: string;
  diagnostics: MarkdownImportDiagnostic[];
} {
  const split = splitFrontmatter(source);
  if (split.frontmatterText === null) {
    return { frontmatter: {}, body: split.body, diagnostics: [] };
  }

  const document = parseDocument(split.frontmatterText, {
    uniqueKeys: true,
    prettyErrors: true,
  });
  if (document.errors.length > 0) {
    return {
      frontmatter: {},
      body: split.body,
      diagnostics: [
        diagnostic(
          source,
          "invalid-frontmatter",
          "error",
          `Frontmatter is invalid: ${document.errors[0]?.message ?? "unknown YAML error"}`,
          "Use a YAML object with unique keys and no aliases.",
        ),
      ],
    };
  }
  const parsed = FrontmatterSchema.safeParse(
    document.toJS({ maxAliasCount: 0 }),
  );
  if (!parsed.success) {
    return {
      frontmatter: {},
      body: split.body,
      diagnostics: [
        diagnostic(
          source,
          "invalid-frontmatter-shape",
          "error",
          "Frontmatter must be a YAML object.",
          "Wrap frontmatter values in key/value pairs.",
        ),
      ],
    };
  }
  return { frontmatter: parsed.data, body: split.body, diagnostics: [] };
}

function hasExecutableMdx(source: MarkdownImportSource): boolean {
  if (!/\.mdx$/i.test(source.path)) return false;
  const withoutCode = source.content.replace(/```[\s\S]*?```/g, "");
  return /(^|\n)\s*(?:import|export)\s|<\/?[A-Z][\w.-]*\b|{[^}\n]+}/.test(
    withoutCode,
  );
}

function safeLink(href: string): boolean {
  return /^(?:https?:|mailto:|tel:|\/|#)/i.test(href);
}

function appendInlineTokens(
  tokens: readonly Token[],
  marks: readonly string[],
  markDefs: StructuredTextMarkDef[],
  diagnostics: MarkdownImportDiagnostic[],
  source: MarkdownImportSource,
): StructuredTextSpan[] {
  const spans: StructuredTextSpan[] = [];
  const appendText = (text: string, nextMarks = marks): void => {
    if (!text) return;
    spans.push({
      _type: "span",
      _key: generateId(),
      text,
      marks: [...nextMarks],
    });
  };

  for (const token of tokens) {
    switch (token.type) {
      case "text":
      case "escape":
      case "codespan":
        appendText(
          token.text,
          token.type === "codespan" ? [...marks, "code"] : marks,
        );
        break;
      case "br":
        appendText("\n");
        break;
      case "strong":
        spans.push(
          ...appendInlineTokens(
            token.tokens ?? [],
            [...marks, "strong"],
            markDefs,
            diagnostics,
            source,
          ),
        );
        break;
      case "em":
        spans.push(
          ...appendInlineTokens(
            token.tokens ?? [],
            [...marks, "em"],
            markDefs,
            diagnostics,
            source,
          ),
        );
        break;
      case "del":
        spans.push(
          ...appendInlineTokens(
            token.tokens ?? [],
            [...marks, "strike"],
            markDefs,
            diagnostics,
            source,
          ),
        );
        break;
      case "link": {
        if (!safeLink(token.href)) {
          diagnostics.push(
            diagnostic(
              source,
              "unsafe-link",
              "warning",
              `Removed unsafe link: ${token.href}`,
              "Use https, mailto, tel, site-relative, or anchor links.",
            ),
          );
          spans.push(
            ...appendInlineTokens(
              token.tokens ?? [],
              marks,
              markDefs,
              diagnostics,
              source,
            ),
          );
          break;
        }
        const key = generateId();
        markDefs.push({ _key: key, _type: "link", href: token.href });
        spans.push(
          ...appendInlineTokens(
            token.tokens ?? [],
            [...marks, key],
            markDefs,
            diagnostics,
            source,
          ),
        );
        break;
      }
      case "image":
        diagnostics.push(
          diagnostic(
            source,
            "image-not-imported",
            "warning",
            `Image was not imported: ${token.href}`,
            "Upload media separately and add it in the entry editor.",
          ),
        );
        appendText(token.text);
        break;
      case "html":
        diagnostics.push(
          diagnostic(
            source,
            "html-not-supported",
            "error",
            "Raw HTML is not supported in Markdown imports.",
            "Use Markdown syntax or clean the HTML before importing.",
          ),
        );
        break;
      default:
        if ("text" in token && typeof token.text === "string")
          appendText(token.text);
    }
  }
  return spans;
}

function createBlock(input: {
  style: "normal" | "h2" | "h3" | "h4" | "blockquote";
  tokens: readonly Token[];
  diagnostics: MarkdownImportDiagnostic[];
  source: MarkdownImportSource;
  listItem?: "bullet" | "number";
  level?: number;
}) {
  const markDefs: StructuredTextMarkDef[] = [];
  const children = appendInlineTokens(
    input.tokens,
    [],
    markDefs,
    input.diagnostics,
    input.source,
  );
  return {
    _type: "block" as const,
    _key: generateId(),
    style: input.style,
    ...(input.listItem
      ? { listItem: input.listItem, level: input.level ?? 1 }
      : {}),
    markDefs,
    children:
      children.length > 0
        ? children
        : [{ _type: "span" as const, _key: generateId(), text: "", marks: [] }],
  };
}

function markdownToStructuredText(
  source: MarkdownImportSource,
  markdown: string,
): {
  body: StructuredTextDocument;
  diagnostics: MarkdownImportDiagnostic[];
} {
  const diagnostics: MarkdownImportDiagnostic[] = [];
  const blocks: StructuredTextDocument = [];
  let tokens: Token[];
  try {
    tokens = marked.lexer(markdown, { gfm: true, breaks: false });
  } catch (error) {
    return {
      body: [],
      diagnostics: [
        diagnostic(
          source,
          "invalid-markdown",
          "error",
          error instanceof Error
            ? error.message
            : "Markdown could not be parsed.",
        ),
      ],
    };
  }
  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;
      case "paragraph":
      case "text":
        blocks.push(
          createBlock({
            style: "normal",
            tokens: token.tokens ?? [],
            diagnostics,
            source,
          }),
        );
        break;
      case "heading":
        if (token.depth === 1)
          diagnostics.push(
            diagnostic(
              source,
              "heading-level-normalized",
              "warning",
              "H1 was imported as H2.",
              "Use H2-H4 for exact heading levels.",
            ),
          );
        blocks.push(
          createBlock({
            style: token.depth >= 4 ? "h4" : token.depth === 3 ? "h3" : "h2",
            tokens: token.tokens ?? [],
            diagnostics,
            source,
          }),
        );
        break;
      case "blockquote":
        blocks.push(
          createBlock({
            style: "blockquote",
            tokens: token.tokens ?? [],
            diagnostics,
            source,
          }),
        );
        break;
      case "list":
        for (const item of token.items) {
          blocks.push(
            createBlock({
              style: "normal",
              tokens: item.tokens,
              diagnostics,
              source,
              listItem: token.ordered ? "number" : "bullet",
            }),
          );
        }
        break;
      case "hr":
        blocks.push({ _type: "divider", _key: generateId() });
        break;
      case "code":
        blocks.push({
          _type: "block",
          _key: generateId(),
          style: "normal",
          markDefs: [],
          children: [
            {
              _type: "span",
              _key: generateId(),
              text: token.text,
              marks: ["code"],
            },
          ],
        });
        break;
      case "html":
        diagnostics.push(
          diagnostic(
            source,
            "html-not-supported",
            "error",
            "Raw HTML is not supported in Markdown imports.",
            "Use Markdown syntax or clean the HTML before importing.",
          ),
        );
        break;
      case "table":
        diagnostics.push(
          diagnostic(
            source,
            "table-not-supported",
            "warning",
            "Markdown table was skipped.",
            "Convert table content to a list or add it manually after import.",
          ),
        );
        break;
      default:
        diagnostics.push(
          diagnostic(
            source,
            "markdown-node-not-supported",
            "warning",
            `Unsupported Markdown node: ${token.type}.`,
            "Rewrite this content using supported Markdown.",
          ),
        );
    }
  }
  return { body: StructuredTextDocumentSchema.parse(blocks), diagnostics };
}

function parseDocumentSource(
  source: MarkdownImportSource,
  settings: ContentLocalizationSettings,
): ParsedDocument {
  const parsed = parseFrontmatter(source);
  const diagnostics = [...parsed.diagnostics];
  if (hasExecutableMdx(source)) {
    diagnostics.push(
      diagnostic(
        source,
        "mdx-not-supported",
        "error",
        "Executable MDX and JSX are not supported.",
        "Remove imports, exports, expressions, and JSX before importing.",
      ),
    );
  }
  const rawTitle = parsed.frontmatter.title;
  const title =
    typeof rawTitle === "string" && rawTitle.trim()
      ? rawTitle.trim()
      : filenameStem(source.path).replace(/[-_]+/g, " ").trim() || null;
  if (
    typeof rawTitle !== "undefined" &&
    (typeof rawTitle !== "string" || !rawTitle.trim())
  ) {
    diagnostics.push(
      diagnostic(
        source,
        "invalid-title",
        "error",
        "Frontmatter title must be a non-empty string.",
      ),
    );
  }
  if (!title)
    diagnostics.push(
      diagnostic(
        source,
        "missing-title",
        "error",
        "A title or filename is required.",
      ),
    );

  const rawSlug = parsed.frontmatter.slug;
  const slugSource =
    typeof rawSlug === "string" && rawSlug.trim()
      ? rawSlug
      : filenameStem(source.path);
  const slug = slugify(slugSource);
  if (!slug)
    diagnostics.push(
      diagnostic(
        source,
        "missing-slug",
        "error",
        "A valid slug could not be derived.",
        "Add a slug or rename the file using lowercase URL-safe words.",
      ),
    );
  if (typeof rawSlug !== "undefined" && typeof rawSlug !== "string")
    diagnostics.push(
      diagnostic(
        source,
        "invalid-slug",
        "error",
        "Frontmatter slug must be a string.",
      ),
    );

  const localeInput = parsed.frontmatter.locale;
  let locale: string | null = settings.defaultLocale;
  if (localeInput !== undefined) {
    const localeResult = LocaleCodeSchema.safeParse(localeInput);
    if (!localeResult.success) {
      locale = null;
      diagnostics.push(
        diagnostic(
          source,
          "invalid-locale",
          "error",
          "Frontmatter locale must be a valid BCP 47 code.",
        ),
      );
    } else if (
      !settings.locales.some(
        (item) => item.code === localeResult.data && item.enabled,
      )
    ) {
      locale = null;
      diagnostics.push(
        diagnostic(
          source,
          "locale-not-enabled",
          "error",
          `Locale ${localeResult.data} is not enabled for content editing.`,
        ),
      );
    } else {
      locale = localeResult.data;
    }
  }

  const bodyResult = markdownToStructuredText(source, parsed.body);
  diagnostics.push(...bodyResult.diagnostics);
  return {
    source,
    title,
    slug: slug || null,
    locale,
    frontmatter: parsed.frontmatter,
    body: bodyResult.body,
    diagnostics,
  };
}

function mappedFrontmatter(input: {
  parsed: ParsedDocument;
  collection: MarkdownImportPreview["collection"];
}): {
  frontmatter: Record<string, unknown>;
  diagnostics: MarkdownImportDiagnostic[];
} {
  const diagnostics: MarkdownImportDiagnostic[] = [];
  const fields = new Map(
    input.collection.schema.fields.map((field) => [field.key, field]),
  );
  const frontmatter: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.parsed.frontmatter)) {
    if (RESERVED_KEYS.has(key)) {
      if (key === "status")
        diagnostics.push(
          diagnostic(
            input.parsed.source,
            "status-ignored",
            "info",
            "Imported entries always start as drafts.",
          ),
        );
      continue;
    }
    const field = fields.get(key);
    if (!field) {
      diagnostics.push(
        diagnostic(
          input.parsed.source,
          "unknown-field",
          "warning",
          `Frontmatter key ${key} is not in the target collection and was skipped.`,
          "Add the field to the collection before importing, then preview again.",
        ),
      );
      continue;
    }
    if (field.type === "relation") {
      diagnostics.push(
        diagnostic(
          input.parsed.source,
          "relation-not-supported",
          "error",
          `Relation field ${key} cannot be imported from frontmatter yet.`,
          "Create the entry first, then set relations in the Studio.",
        ),
      );
      continue;
    }
    frontmatter[key] = value;
  }
  const validation = validateEntryFrontmatter(
    collectionSchemaForEntryFrontmatter(input.collection),
    frontmatter,
    { allowMissingRequired: true },
  );
  if (!validation.success) {
    for (const error of validation.errors)
      diagnostics.push(
        diagnostic(input.parsed.source, "invalid-field-value", "error", error),
      );
  }
  return { frontmatter, diagnostics };
}

function suggestionType(value: unknown): FieldSchema["type"] | null {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return "multiSelect";
  }
  return null;
}

function allowedSuggestionTypes(
  type: FieldSchema["type"],
  hasOptions: boolean,
): FieldSchema["type"][] {
  switch (type) {
    case "string":
      return hasOptions
        ? ["string", "text", "slug", "select"]
        : ["string", "text", "slug"];
    case "boolean":
      return ["boolean"];
    case "integer":
      return ["integer", "number"];
    case "number":
      return ["number"];
    case "multiSelect":
      return hasOptions ? ["multiSelect"] : [];
    default:
      return [];
  }
}

function humanizeFieldKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectFieldSuggestions(input: {
  collection: MarkdownImportPreview["collection"];
  documents: readonly ParsedDocument[];
}): MarkdownImportSuggestedField[] {
  const existing = new Set(
    input.collection.schema.fields.map((field) => field.key),
  );
  const values = new Map<
    string,
    {
      value: unknown;
      type: FieldSchema["type"];
      sourcePaths: string[];
      options: Set<string>;
    }
  >();
  const incompatible = new Set<string>();

  for (const document of input.documents) {
    for (const [key, value] of Object.entries(document.frontmatter)) {
      if (
        RESERVED_KEYS.has(key) ||
        existing.has(key) ||
        !/^[a-z][a-z0-9_]*$/.test(key)
      ) {
        continue;
      }
      const type = suggestionType(value);
      if (!type) continue;
      const current = values.get(key);
      if (current && current.type !== type) {
        incompatible.add(key);
        continue;
      }
      values.set(key, {
        value: current?.value ?? value,
        type,
        sourcePaths: [
          ...new Set([...(current?.sourcePaths ?? []), document.source.path]),
        ],
        options: new Set([
          ...(current?.options ?? []),
          ...(typeof value === "string"
            ? value.trim()
              ? [value.trim()]
              : []
            : Array.isArray(value)
              ? value
                  .filter(
                    (item): item is string =>
                      typeof item === "string" && item.trim().length > 0,
                  )
                  .map((item) => item.trim())
              : []),
        ]),
      });
    }
  }

  return [...values.entries()]
    .filter(([key]) => !incompatible.has(key))
    .flatMap(([key, value]) => {
      const options = [...value.options];
      const allowedTypes = allowedSuggestionTypes(
        value.type,
        options.length > 0 && options.length <= 64,
      );
      if (allowedTypes.length === 0) return [];
      return [
        {
          key,
          label: humanizeFieldKey(key),
          type: value.type,
          allowedTypes,
          ...(options.length > 0 && options.length <= 64 ? { options } : {}),
          sourcePaths: value.sourcePaths,
          sample: value.value,
        },
      ];
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function buildPreview(
  adapter: StorageAdapter,
  input: MarkdownImportPreviewInput,
): Promise<{ preview: MarkdownImportPreview; documents: ParsedDocument[] }> {
  const collection = await getCollectionFromAdapter(
    adapter,
    input.collectionId,
  );
  const settings = await getContentLocaleSettings(adapter);
  const documents = input.sources.map((source) =>
    parseDocumentSource(source, settings),
  );
  const seen = new Map<string, ParsedDocument[]>();
  for (const document of documents) {
    if (!document.slug || !document.locale) continue;
    const key = `${document.locale}\u0000${document.slug}`;
    seen.set(key, [...(seen.get(key) ?? []), document]);
  }
  const duplicateSources = new Set(
    [...seen.values()]
      .filter((entries) => entries.length > 1)
      .flat()
      .map((entry) => entry.source.path),
  );

  const items: MarkdownImportItem[] = [];
  for (const document of documents) {
    const mapped = mappedFrontmatter({ parsed: document, collection });
    const diagnostics = [...document.diagnostics, ...mapped.diagnostics];
    if (!collection.supports.includes("body") && document.body?.length) {
      diagnostics.push(
        diagnostic(
          document.source,
          "body-not-supported",
          "warning",
          "Markdown body was skipped because this collection does not support body content.",
          "Enable body support on the collection to import the document body.",
        ),
      );
    }
    if (duplicateSources.has(document.source.path))
      diagnostics.push(
        diagnostic(
          document.source,
          "duplicate-source-slug",
          "error",
          "Another source file resolves to the same locale and slug.",
          "Use unique slugs per locale.",
        ),
      );
    let action: MarkdownImportItem["action"] = diagnostics.some(
      (item) => item.severity === "error",
    )
      ? "fail"
      : "create";
    if (action !== "fail" && document.slug && document.locale) {
      const existing = await adapter.getEntry({
        collectionId: collection.id,
        idOrSlug: document.slug,
        locale: document.locale,
      });
      if (existing) {
        action = input.mode === "update" ? "update" : "skip";
        diagnostics.push(
          diagnostic(
            document.source,
            input.mode === "update"
              ? "existing-entry-update"
              : "existing-entry-skipped",
            "info",
            input.mode === "update"
              ? "Existing entry will be updated after confirmation."
              : "Existing entry will be skipped.",
            input.mode === "update"
              ? undefined
              : "Choose Update existing entries to replace imported fields and body.",
          ),
        );
      }
    }
    items.push({
      sourcePath: document.source.path,
      title: document.title,
      slug: document.slug,
      locale: document.locale,
      action,
      diagnostics,
    });
  }
  const summary = {
    creates: items.filter((item) => item.action === "create").length,
    updates: items.filter((item) => item.action === "update").length,
    skips: items.filter((item) => item.action === "skip").length,
    errors: items.filter((item) => item.action === "fail").length,
    warnings: items
      .flatMap((item) => item.diagnostics)
      .filter((item) => item.severity === "warning").length,
  };
  return {
    preview: MarkdownImportPreviewSchema.parse({
      collection,
      mode: input.mode,
      canApply: summary.errors === 0 && summary.creates + summary.updates > 0,
      items,
      fieldSuggestions: collectFieldSuggestions({ collection, documents }),
      summary,
    }),
    documents,
  };
}

export async function previewMarkdownImport(
  adapter: StorageAdapter,
  input: MarkdownImportPreviewInput,
): Promise<MarkdownImportPreview> {
  const parsed = MarkdownImportPreviewInputSchema.parse(input);
  return (await buildPreview(adapter, parsed)).preview;
}

export async function applyMarkdownImport(
  adapter: StorageAdapter,
  input: MarkdownImportApplyInput,
  actor: ActorRef,
): Promise<MarkdownImportApplyReport> {
  const parsed = MarkdownImportApplyInputSchema.parse(input);
  let { preview, documents } = await buildPreview(adapter, parsed);
  if (!preview.canApply) {
    return MarkdownImportApplyReportSchema.parse({
      ...preview,
      applied: false,
      addedFieldKeys: [],
    });
  }

  const requestedFields = parsed.addFields;
  const requestedFieldKeys = requestedFields.map((field) => field.key);
  if (new Set(requestedFieldKeys).size !== requestedFieldKeys.length) {
    throw new CmsServiceError(
      "VALIDATION_ERROR",
      "Each suggested schema field can only be selected once.",
    );
  }
  if (requestedFields.length > 0) {
    const suggestions = new Map(
      preview.fieldSuggestions.map((field) => [field.key, field]),
    );
    const unknown = requestedFieldKeys.filter((key) => !suggestions.has(key));
    if (unknown.length > 0) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        `Selected schema fields are no longer available: ${unknown.join(", ")}`,
      );
    }
    const invalidTypes = requestedFields.filter((field) => {
      const suggestion = suggestions.get(field.key);
      return !suggestion || !suggestion.allowedTypes.includes(field.type);
    });
    if (invalidTypes.length > 0) {
      throw new CmsServiceError(
        "VALIDATION_ERROR",
        `Selected schema field types are not supported: ${invalidTypes.map((field) => `${field.key} (${field.type})`).join(", ")}`,
      );
    }
    await updateCollectionOnAdapter(adapter, {
      id: preview.collection.id,
      expectedUpdatedAt: preview.collection.updatedAt,
      patch: {
        fields: [
          ...preview.collection.schema.fields,
          ...requestedFields.map((field) => {
            const suggestion = suggestions.get(field.key)!;
            return {
              key: suggestion.key,
              label: suggestion.label,
              type: field.type,
              ...(field.type === "select" || field.type === "multiSelect"
                ? { options: suggestion.options! }
                : {}),
            } satisfies FieldSchema;
          }),
        ],
      },
    });
    ({ preview, documents } = await buildPreview(adapter, parsed));
  }

  if (!preview.canApply) {
    return MarkdownImportApplyReportSchema.parse({
      ...preview,
      applied: false,
      addedFieldKeys: [],
    });
  }
  const collection = preview.collection;
  const itemByPath = new Map(
    preview.items.map((item) => [item.sourcePath, item]),
  );
  for (const document of documents) {
    const item = itemByPath.get(document.source.path);
    if (
      !item ||
      (item.action !== "create" && item.action !== "update") ||
      !document.title ||
      !document.slug ||
      !document.locale
    )
      continue;
    const { frontmatter } = mappedFrontmatter({ parsed: document, collection });
    const body = collection.supports.includes("body") ? document.body : null;
    const existing = await adapter.getEntry({
      collectionId: collection.id,
      idOrSlug: document.slug,
      locale: document.locale,
    });
    if (item.action === "create") {
      if (existing)
        throw new CmsServiceError(
          "CONFLICT",
          `Entry already exists: ${document.slug} (${document.locale})`,
        );
      await createEntryOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          title: document.title,
          slug: document.slug,
          locale: document.locale,
          frontmatter,
          ...(body ? { body } : {}),
        },
        actor,
      );
    } else {
      if (!existing)
        throw new CmsServiceError(
          "CONFLICT",
          `Entry changed since preview: ${document.slug} (${document.locale})`,
        );
      await updateEntryOnAdapter(
        adapter,
        {
          collectionId: collection.id,
          id: existing.entry.id,
          version: existing.entry.version,
          patch: {
            title: document.title,
            slug: document.slug,
            locale: document.locale,
            frontmatter,
            ...(body ? { body } : {}),
          },
        },
        actor,
      );
    }
  }
  return MarkdownImportApplyReportSchema.parse({
    ...preview,
    applied: true,
    addedFieldKeys: requestedFieldKeys,
  });
}
