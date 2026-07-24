import { z } from "zod";
import {
  ArchiveEntryRequestSchema,
  CheckEntrySlugAvailabilityRequestSchema,
  CheckEntrySlugAvailabilityResponseSchema,
  ClearCollectionTemplateRequestSchema,
  CompileSchemaRequestSchema,
  CompileSchemaResponseSchema,
  DeleteCollectionRequestSchema,
  DeleteCollectionResponseSchema,
  DeleteEntryRequestSchema,
  GetCollectionRequestSchema,
  GetCmsPageUsageIndexRequestSchema,
  GetCmsPageUsageIndexResponseSchema,
  GetEntryRequestSchema,
  GetRevisionRequestSchema,
  ListCollectionPermissionsRequestSchema,
  ListCollectionPermissionsResponseSchema,
  ListCollectionsRequestSchema,
  ListCollectionsResponseSchema,
  ListEntriesResponseSchema,
  ListRevisionsRequestSchema,
  ListRevisionsResponseSchema,
  PublishEntryRequestSchema,
  RestoreEntrySnapshotRequestSchema,
  RestoreRevisionRequestSchema,
  SearchCmsRequestSchema,
  SearchCmsResponseSchema,
  SetCollectionPermissionsRequestSchema,
  SetCollectionPermissionsResponseSchema,
  SetCollectionTemplateRequestSchema,
  UnpublishEntryRequestSchema,
} from "../cms/actionSchemas";
import {
  AriaCollectionSchema,
  AriaEntryRecordSchema,
  AriaEntryRevisionSchema,
  CreateCollectionRequestSchema,
  CreateEntryRequestSchema,
  EntryListRequestSchema,
  EntryQueryRequestSchema,
  UpdateCollectionRequestSchema,
  UpdateEntryRequestSchema,
} from "../cms/schemas";

export type CmsOpenApiOperation = {
  operationId: string;
  summary: string;
  input: z.ZodType;
  output: z.ZodType;
};

export const CMS_OPENAPI_OPERATIONS: readonly CmsOpenApiOperation[] = [
  {
    operationId: "cms.collections.list",
    summary: "List CMS collections",
    input: ListCollectionsRequestSchema,
    output: ListCollectionsResponseSchema,
  },
  {
    operationId: "cms.collections.get",
    summary: "Get a CMS collection",
    input: GetCollectionRequestSchema,
    output: AriaCollectionSchema,
  },
  {
    operationId: "cms.collections.create",
    summary: "Create a CMS collection",
    input: CreateCollectionRequestSchema,
    output: AriaCollectionSchema,
  },
  {
    operationId: "cms.collections.update",
    summary: "Update a CMS collection",
    input: UpdateCollectionRequestSchema,
    output: AriaCollectionSchema,
  },
  {
    operationId: "cms.collections.remove",
    summary: "Delete a CMS collection",
    input: DeleteCollectionRequestSchema,
    output: DeleteCollectionResponseSchema,
  },
  {
    operationId: "cms.collections.compileSchema",
    summary: "Compile a CMS collection schema",
    input: CompileSchemaRequestSchema,
    output: CompileSchemaResponseSchema,
  },
  {
    operationId: "cms.collections.setTemplate",
    summary: "Assign template routing to a collection",
    input: SetCollectionTemplateRequestSchema,
    output: AriaCollectionSchema,
  },
  {
    operationId: "cms.collections.clearTemplate",
    summary: "Clear template routing from a collection",
    input: ClearCollectionTemplateRequestSchema,
    output: AriaCollectionSchema,
  },
  {
    operationId: "cms.collections.listPermissions",
    summary: "List per-collection permission grants",
    input: ListCollectionPermissionsRequestSchema,
    output: ListCollectionPermissionsResponseSchema,
  },
  {
    operationId: "cms.collections.setPermissions",
    summary: "Replace per-collection permission grants",
    input: SetCollectionPermissionsRequestSchema,
    output: SetCollectionPermissionsResponseSchema,
  },
  {
    operationId: "cms.entries.checkSlugAvailability",
    summary: "Check CMS entry slug availability for a locale",
    input: CheckEntrySlugAvailabilityRequestSchema,
    output: CheckEntrySlugAvailabilityResponseSchema,
  },
  {
    operationId: "cms.entries.list",
    summary: "List CMS entries",
    input: EntryListRequestSchema,
    output: ListEntriesResponseSchema,
  },
  {
    operationId: "cms.entries.query",
    summary: "Query CMS entries",
    input: EntryQueryRequestSchema,
    output: ListEntriesResponseSchema,
  },
  {
    operationId: "cms.search",
    summary: "Search CMS collections and entries",
    input: SearchCmsRequestSchema,
    output: SearchCmsResponseSchema,
  },
  {
    operationId: "cms.entries.get",
    summary: "Get a CMS entry",
    input: GetEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.create",
    summary: "Create a CMS entry",
    input: CreateEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.update",
    summary: "Update a CMS entry",
    input: UpdateEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.remove",
    summary: "Delete a CMS entry",
    input: DeleteEntryRequestSchema,
    output: z.object({ success: z.literal(true) }).strict(),
  },
  {
    operationId: "cms.entries.publish",
    summary: "Publish a CMS entry",
    input: PublishEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.unpublish",
    summary: "Unpublish a CMS entry",
    input: UnpublishEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.archive",
    summary: "Archive a CMS entry",
    input: ArchiveEntryRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.entries.restoreSnapshot",
    summary: "Restore a CMS entry snapshot",
    input: RestoreEntrySnapshotRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.revisions.list",
    summary: "List CMS entry revisions",
    input: ListRevisionsRequestSchema,
    output: ListRevisionsResponseSchema,
  },
  {
    operationId: "cms.revisions.get",
    summary: "Get a CMS entry revision",
    input: GetRevisionRequestSchema,
    output: AriaEntryRevisionSchema,
  },
  {
    operationId: "cms.revisions.restore",
    summary: "Restore a CMS entry revision",
    input: RestoreRevisionRequestSchema,
    output: AriaEntryRecordSchema,
  },
  {
    operationId: "cms.pages.usageIndex",
    summary: "Get CMS page usage index",
    input: GetCmsPageUsageIndexRequestSchema,
    output: GetCmsPageUsageIndexResponseSchema,
  },
] as const;

export const CMS_ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "SCHEMA_ERROR",
  "RATE_LIMITED",
  "INTERNAL",
] as const;
