/**
 * CMS constants and string-literal unions.
 */

export const COLLECTION_KINDS = ["content", "data", "config", "tags"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const COLLECTION_SCOPES = ["global", "collection"] as const;
export type CollectionScope = (typeof COLLECTION_SCOPES)[number];

export const ENTRY_STATUSES = [
  "draft",
  "published",
  "scheduled",
  "archived",
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const COLLECTION_PERMISSION_ACTIONS = [
  "read",
  "create",
  "update",
  "delete",
  "publish",
  "schema_edit",
  "tag_create",
] as const;
export type CollectionPermissionAction =
  (typeof COLLECTION_PERMISSION_ACTIONS)[number];

export const COLLECTION_POLICY_MODES = ["inherit", "restricted"] as const;
export type CollectionPolicyMode = (typeof COLLECTION_POLICY_MODES)[number];

export const COLLECTION_POLICY_DOCUMENT_SCOPES = ["all", "own"] as const;
export type CollectionPolicyDocumentScope =
  (typeof COLLECTION_POLICY_DOCUMENT_SCOPES)[number];

export const COLLECTION_SUPPORTS = [
  "body",
  "cover",
  "drafts",
  "revisions",
  "scheduling",
  "search",
  "seo",
  "rss",
  "comments",
] as const;
export type CollectionSupport = (typeof COLLECTION_SUPPORTS)[number];

export const FIELD_TYPES = [
  "string",
  "text",
  "slug",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "select",
  "multiSelect",
  "color",
  "icon",
  "image",
  "file",
  "reference",
  "relation",
  "structuredText",
  "richtext",
  "json",
  "repeater",
  "object",
  "link",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type CmsErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SCHEMA_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL";

export type EntrySortField =
  | "title"
  | "slug"
  | "updatedAt"
  | "publishedAt"
  | "createdAt";

export interface EntrySort {
  field: EntrySortField;
  direction: "asc" | "desc";
}

export interface EntryQueryParams {
  collectionId: string;
  filter?: Record<string, unknown>;
  sort?: EntrySort[];
  limit?: number;
  offset?: number;
  status?: EntryStatus | EntryStatus[];
  locale?: string;
  include?: string[];
  entryContext?: {
    collectionId: string;
    entryId: string;
    slug: string;
  };
}

import type { CmsListFilter } from "./listFilters";

export interface EntryListParams {
  collectionId: string;
  status?: EntryStatus | EntryStatus[];
  query?: string;
  page?: number;
  limit?: number;
  sort?: EntrySort[];
  locale?: string;
  /** Ordered, normalized locale candidates resolved from site settings. */
  localeFallbacks?: string[];
  filter?: CmsListFilter;
}

export interface EntryListResult {
  items: import("./schemas").AriaEntryRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface AriaCollectionPermission {
  principalId: string;
  collectionId: string;
  action: CollectionPermissionAction;
}
