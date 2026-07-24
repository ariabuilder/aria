/**
 * Authorship schema migrations — single source of truth
 * for column adds and best-effort backfill SQL.
 */

import { z } from "zod";
import {
  ASSET_ROW_AUTHORSHIP_COLUMNS,
  MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
  SINGLETON_AUTHORSHIP_TABLES,
  VERSION_AUTHORSHIP_COLUMNS,
  VERSIONED_ASSET_META,
  type SingletonAuthorshipTable,
} from "./storageTargets";

export const VERSION_AUTHORSHIP_TABLES = [
  VERSIONED_ASSET_META.page.versionTable,
  VERSIONED_ASSET_META.layout.versionTable,
  VERSIONED_ASSET_META.component.versionTable,
] as const;

export type VersionAuthorshipTable = (typeof VERSION_AUTHORSHIP_TABLES)[number];

export const VersionAuthorshipTableSchema = z.enum(VERSION_AUTHORSHIP_TABLES);

export const SingletonAuthorshipTableSchema = z.enum(
  SINGLETON_AUTHORSHIP_TABLES,
);

export const AuthorshipTableNameSchema = z.union([
  VersionAuthorshipTableSchema,
  SingletonAuthorshipTableSchema,
]);

export type AuthorshipTableName = z.infer<typeof AuthorshipTableNameSchema>;

export const ALL_AUTHORSHIP_COLUMN_NAMES = [
  ...VERSION_AUTHORSHIP_COLUMNS,
  ...ASSET_ROW_AUTHORSHIP_COLUMNS,
  ...MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
] as const;

export type AuthorshipColumnName = (typeof ALL_AUTHORSHIP_COLUMN_NAMES)[number];

export const AuthorshipColumnNameSchema = z.enum(ALL_AUTHORSHIP_COLUMN_NAMES);

export const AuthorshipColumnTargetSchema = z
  .object({
    table: AuthorshipTableNameSchema,
    column: AuthorshipColumnNameSchema,
  })
  .strict();

export type AuthorshipColumnTarget = z.infer<
  typeof AuthorshipColumnTargetSchema
>;

export const AuthorshipColumnTargetsSchema = z.array(
  AuthorshipColumnTargetSchema,
);

const MEDIA_ASSET_TABLE: SingletonAuthorshipTable = "aria_media_assets";

const STANDARD_SINGLETON_TABLES = SINGLETON_AUTHORSHIP_TABLES.filter(
  (
    table,
  ): table is Exclude<SingletonAuthorshipTable, typeof MEDIA_ASSET_TABLE> =>
    table !== MEDIA_ASSET_TABLE,
);

function columnsForSingletonTable(
  table: SingletonAuthorshipTable,
): readonly AuthorshipColumnName[] {
  SingletonAuthorshipTableSchema.parse(table);

  if (table === MEDIA_ASSET_TABLE) {
    return [
      ...ASSET_ROW_AUTHORSHIP_COLUMNS,
      ...MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
    ];
  }

  return ASSET_ROW_AUTHORSHIP_COLUMNS;
}

function buildColumnTargets(): AuthorshipColumnTarget[] {
  const targets: AuthorshipColumnTarget[] = [];

  for (const table of VERSION_AUTHORSHIP_TABLES) {
    for (const column of VERSION_AUTHORSHIP_COLUMNS) {
      targets.push(AuthorshipColumnTargetSchema.parse({ table, column }));
    }
  }

  for (const table of SINGLETON_AUTHORSHIP_TABLES) {
    for (const column of columnsForSingletonTable(table)) {
      targets.push(AuthorshipColumnTargetSchema.parse({ table, column }));
    }
  }

  return AuthorshipColumnTargetsSchema.parse(targets);
}

const AUTHORSHIP_COLUMN_TARGETS = buildColumnTargets();

export function getAuthorshipColumnTargets(): readonly AuthorshipColumnTarget[] {
  return AUTHORSHIP_COLUMN_TARGETS;
}

export function getAuthorshipColumnsForTable(
  table: AuthorshipTableName,
): readonly AuthorshipColumnName[] {
  const parsedTable = AuthorshipTableNameSchema.parse(table);

  if (VersionAuthorshipTableSchema.safeParse(parsedTable).success) {
    return VERSION_AUTHORSHIP_COLUMNS;
  }

  return columnsForSingletonTable(
    SingletonAuthorshipTableSchema.parse(parsedTable),
  );
}

export function buildAlterTableAddColumnStatement(
  target: AuthorshipColumnTarget,
): string {
  const parsed = AuthorshipColumnTargetSchema.parse(target);
  return `ALTER TABLE ${parsed.table} ADD COLUMN ${parsed.column} TEXT`;
}

export function getAuthorshipMigrationStatements(): readonly string[] {
  return getAuthorshipColumnTargets().map(buildAlterTableAddColumnStatement);
}

const LEGACY_DSL_AUTHOR_ID = "$.author.id";
const LEGACY_DSL_AUTHOR_NAME = "$.author.name";
const LEGACY_DSL_AUTHOR_EMAIL = "$.author.email";

function buildVersionAuthorshipBackfillStatement(
  table: VersionAuthorshipTable,
): string {
  VersionAuthorshipTableSchema.parse(table);

  return `UPDATE ${table}
   SET created_by_id = NULLIF(TRIM(json_extract(dsl_json, '${LEGACY_DSL_AUTHOR_ID}')), ''),
       created_by_username = NULLIF(TRIM(json_extract(dsl_json, '${LEGACY_DSL_AUTHOR_NAME}')), ''),
       created_by_email = NULLIF(TRIM(json_extract(dsl_json, '${LEGACY_DSL_AUTHOR_EMAIL}')), '')
 WHERE created_by_id IS NULL
   AND json_valid(dsl_json)
   AND NULLIF(TRIM(json_extract(dsl_json, '${LEGACY_DSL_AUTHOR_ID}')), '') IS NOT NULL`;
}

export function getVersionAuthorshipBackfillStatements(): readonly string[] {
  return VERSION_AUTHORSHIP_TABLES.map(buildVersionAuthorshipBackfillStatement);
}

function buildSingletonUpdatedByBackfillStatement(
  table: Exclude<SingletonAuthorshipTable, typeof MEDIA_ASSET_TABLE>,
): string {
  SingletonAuthorshipTableSchema.parse(table);

  return `UPDATE ${table}
   SET updated_by_id = (
         SELECT updated_by
           FROM aria_content_site_state
          WHERE scope = 'default'
            AND updated_by IS NOT NULL
            AND TRIM(updated_by) <> ''
          LIMIT 1
       )
 WHERE updated_by_id IS NULL
   AND EXISTS (
         SELECT 1
           FROM aria_content_site_state
          WHERE scope = 'default'
            AND updated_by IS NOT NULL
            AND TRIM(updated_by) <> ''
       )`;
}

export function getSingletonUpdatedByBackfillStatements(): readonly string[] {
  return (
    STANDARD_SINGLETON_TABLES as Exclude<
      SingletonAuthorshipTable,
      typeof MEDIA_ASSET_TABLE
    >[]
  ).map(buildSingletonUpdatedByBackfillStatement);
}

export function getAuthorshipBackfillStatements(): readonly string[] {
  return [
    ...getVersionAuthorshipBackfillStatements(),
    ...getSingletonUpdatedByBackfillStatements(),
  ];
}

export const AuthorshipMigrationContextSchema = z
  .object({
    hasTable: z.custom<(table: AuthorshipTableName) => Promise<boolean>>(
      (value) => typeof value === "function",
    ),
    hasColumn: z.custom<
      (
        table: AuthorshipTableName,
        column: AuthorshipColumnName,
      ) => Promise<boolean>
    >((value) => typeof value === "function"),
    execute: z.custom<(sql: string) => Promise<void>>(
      (value) => typeof value === "function",
    ),
  })
  .strict();

export type AuthorshipMigrationContext = z.infer<
  typeof AuthorshipMigrationContextSchema
>;

export async function applyAuthorshipColumnMigrations(
  context: AuthorshipMigrationContext,
): Promise<void> {
  const ctx = AuthorshipMigrationContextSchema.parse(context);

  for (const target of getAuthorshipColumnTargets()) {
    const tableExists = await ctx.hasTable(target.table);
    if (!tableExists) {
      continue;
    }

    const columnExists = await ctx.hasColumn(target.table, target.column);
    if (columnExists) {
      continue;
    }

    await ctx.execute(buildAlterTableAddColumnStatement(target));
  }
}

export async function applyAuthorshipBackfill(
  context: AuthorshipMigrationContext,
): Promise<void> {
  const ctx = AuthorshipMigrationContextSchema.parse(context);

  for (const statement of getAuthorshipBackfillStatements()) {
    const tableMatch = /^UPDATE\s+([a-z0-9_]+)/u.exec(statement);
    if (!tableMatch) {
      continue;
    }

    const table = AuthorshipTableNameSchema.parse(tableMatch[1]);
    const tableExists = await ctx.hasTable(table);
    if (!tableExists) {
      continue;
    }

    await ctx.execute(statement);
  }
}

export function isIgnorableAuthorshipMigrationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("duplicate column name") ||
    message.includes("already exists")
  );
}

export function buildCreateTableAuthorshipColumnDefs(
  table: AuthorshipTableName,
): string {
  const columns = getAuthorshipColumnsForTable(table);
  return columns.map((column) => `${column} TEXT`).join(",\n    ");
}
