/**
 * Shared authorship stamping helpers for storage adapters.
 */

import { z } from "zod";
import {
  ActorRefSchema,
  SYSTEM_ACTOR,
  UserPermissionProfileSchema,
  VersionAuthorshipSchema,
  type ActorRef,
  type SessionUser,
  type UserPermissionProfile,
  type VersionAuthorship,
} from "../auth/types";
import type { OperationId } from "../auth/capabilityOperations";
import {
  ASSET_ROW_AUTHORSHIP_COLUMNS,
  MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
  VERSION_AUTHORSHIP_COLUMNS,
} from "./storageTargets";
import {
  AuthorshipSaveContextSchema,
  ContentMutationKindSchema,
  type AuthorshipSaveContext,
  type ContentMutationKind,
} from "../storage/adapter";
import {
  VersionSaveOptionsSchema,
  type VersionSaveOptions,
} from "../storage/versioning";
import {
  MediaAssetAuthorshipContextSchema,
  type MediaAssetAuthorshipContext,
} from "../media/catalog/authorshipSchemas";

export {
  rolePresetFromUserRole,
  resolveUserPermissionProfile,
} from "./permissionProfile";

export type ActorSqlBindings = {
  id: string | null;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type SqlFragment = {
  columnNames: readonly string[];
  values: readonly (string | null)[];
};

export type SingletonAuthorshipInsert = SqlFragment;

export type SingletonAuthorshipUpdate = SqlFragment;

export type MediaAuthorshipMutationKind = z.infer<
  typeof MediaAssetAuthorshipContextSchema
>["mutationKind"] extends infer T
  ? T extends undefined
    ? "create" | "update" | "delete" | "restore"
    : NonNullable<T>
  : never;

const MEDIA_MUTATION_KINDS = [
  "create",
  "update",
  "delete",
  "restore",
] as const satisfies readonly MediaAuthorshipMutationKind[];

/** Columns emitted by version-row INSERT stamping (allowlist guard). */
export const STAMPING_VERSION_COLUMN_NAMES = [
  ...VERSION_AUTHORSHIP_COLUMNS,
] as const;

/** Columns emitted by singleton/asset-row stamping (allowlist guard). */
export const STAMPING_ASSET_ROW_COLUMN_NAMES = [
  ...ASSET_ROW_AUTHORSHIP_COLUMNS,
] as const;

/** Columns emitted by media delete stamping (allowlist guard). */
export const STAMPING_MEDIA_DELETE_COLUMN_NAMES = [
  ...MEDIA_ASSET_DELETE_AUTHORSHIP_COLUMNS,
] as const;

export function parseAuthorshipSaveContext(
  value: unknown,
): AuthorshipSaveContext {
  return AuthorshipSaveContextSchema.parse(value);
}

export function parseOptionalAuthorshipSaveContext(
  value: unknown,
): AuthorshipSaveContext | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseAuthorshipSaveContext(value);
}

export function actorRefToSqlBindings(
  actor: ActorRef | undefined,
): ActorSqlBindings {
  if (!actor) {
    return { id: null, username: null, email: null, avatarUrl: null };
  }

  const parsed = ActorRefSchema.parse(actor);
  return {
    id: parsed.id,
    username: parsed.username ?? null,
    email: parsed.email ?? null,
    avatarUrl: parsed.avatarUrl ?? null,
  };
}

export function sessionUserToActorRef(user: SessionUser): ActorRef {
  return ActorRefSchema.parse({
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
  });
}

export function parsePermissionProfileFromStorage(
  value: unknown,
): UserPermissionProfile | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return undefined;
    }
    try {
      return UserPermissionProfileSchema.parse(JSON.parse(value));
    } catch {
      return undefined;
    }
  }

  const parsed = UserPermissionProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function resolveVersionAuthorshipForSave(
  options: VersionSaveOptions | undefined,
  authorship: AuthorshipSaveContext | undefined,
  createdAt: string,
): VersionAuthorship | undefined {
  const parsedOptions = VersionSaveOptionsSchema.parse(options ?? {});
  const parsedAuthorship = parseOptionalAuthorshipSaveContext(authorship);

  if (parsedOptions.versionAuthorship !== undefined) {
    const explicit = VersionAuthorshipSchema.parse({
      ...parsedOptions.versionAuthorship,
      createdAt,
    });

    if (
      parsedAuthorship &&
      explicit.createdBy &&
      explicit.createdBy.id !== parsedAuthorship.actor.id
    ) {
      throw new Error(
        "versionAuthorship.createdBy.id does not match authorship.actor.id",
      );
    }

    return explicit;
  }

  if (parsedAuthorship) {
    return VersionAuthorshipSchema.parse({
      createdBy: parsedAuthorship.actor,
      createdAt,
    });
  }

  return undefined;
}

export function buildVersionInsertAuthorshipColumns(
  versionAuthorship: VersionAuthorship | undefined,
): SqlFragment {
  if (!versionAuthorship) {
    return { columnNames: [], values: [] };
  }

  const bindings = actorRefToSqlBindings(versionAuthorship.createdBy);
  return {
    columnNames: STAMPING_VERSION_COLUMN_NAMES,
    values: [
      bindings.id,
      bindings.username,
      bindings.email,
      bindings.avatarUrl,
    ],
  };
}

function buildAssetRowCreateColumns(
  authorship: AuthorshipSaveContext | undefined,
): SqlFragment {
  if (!authorship) {
    return { columnNames: [], values: [] };
  }

  const bindings = actorRefToSqlBindings(authorship.actor);
  return {
    columnNames: [
      "created_by_id",
      "created_by_username",
      "created_by_email",
    ] as const,
    values: [bindings.id, bindings.username, bindings.email],
  };
}

function buildAssetRowUpdateColumns(
  authorship: AuthorshipSaveContext | undefined,
): SqlFragment {
  if (!authorship) {
    return { columnNames: [], values: [] };
  }

  const bindings = actorRefToSqlBindings(authorship.actor);
  return {
    columnNames: [
      "updated_by_id",
      "updated_by_username",
      "updated_by_email",
    ] as const,
    values: [bindings.id, bindings.username, bindings.email],
  };
}

export function buildSingletonUpsertAuthorshipAssignments(
  mode: "insert" | "update",
  authorship: AuthorshipSaveContext | undefined,
): SingletonAuthorshipInsert | SingletonAuthorshipUpdate {
  if (mode === "insert") {
    const create = buildAssetRowCreateColumns(authorship);
    const update = buildAssetRowUpdateColumns(authorship);
    return {
      columnNames: [...create.columnNames, ...update.columnNames],
      values: [...create.values, ...update.values],
    };
  }

  return buildAssetRowUpdateColumns(authorship);
}

export function buildDesignSystemRowInsertAuthorship(input: {
  authorship: AuthorshipSaveContext | undefined;
  preservedCreate: ActorSqlBindings | undefined;
}): SqlFragment {
  const createBindings =
    input.preservedCreate ??
    (input.authorship
      ? actorRefToSqlBindings(input.authorship.actor)
      : { id: null, username: null, email: null, avatarUrl: null });
  const updateBindings = input.authorship
    ? actorRefToSqlBindings(input.authorship.actor)
    : { id: null, username: null, email: null, avatarUrl: null };

  return {
    columnNames: STAMPING_ASSET_ROW_COLUMN_NAMES,
    values: [
      createBindings.id,
      createBindings.username,
      createBindings.email,
      updateBindings.id,
      updateBindings.username,
      updateBindings.email,
    ],
  };
}

export function buildMediaAuthorshipPatch(
  mutationKind: MediaAuthorshipMutationKind,
  authorship: MediaAssetAuthorshipContext | undefined,
): { setClauses: string[]; values: (string | null)[] } {
  if (!authorship) {
    return { setClauses: [], values: [] };
  }

  MediaAssetAuthorshipContextSchema.parse(authorship);
  const bindings = actorRefToSqlBindings(authorship.actor);
  const setClauses: string[] = [];
  const values: (string | null)[] = [];

  if (mutationKind === "create") {
    setClauses.push(
      "created_by_id = ?",
      "created_by_username = ?",
      "created_by_email = ?",
    );
    values.push(bindings.id, bindings.username, bindings.email);
  }

  if (
    mutationKind === "create" ||
    mutationKind === "update" ||
    mutationKind === "restore"
  ) {
    setClauses.push(
      "updated_by_id = ?",
      "updated_by_username = ?",
      "updated_by_email = ?",
    );
    values.push(bindings.id, bindings.username, bindings.email);
  }

  if (mutationKind === "delete") {
    setClauses.push(
      "deleted_by_id = ?",
      "deleted_by_username = ?",
      "deleted_by_email = ?",
    );
    values.push(bindings.id, bindings.username, bindings.email);
  }

  if (mutationKind === "restore") {
    setClauses.push(
      "deleted_by_id = NULL",
      "deleted_by_username = NULL",
      "deleted_by_email = NULL",
    );
  }

  return { setClauses, values };
}

export function buildMediaAssetInsertAuthorship(
  authorship: MediaAssetAuthorshipContext | undefined,
): SqlFragment {
  if (!authorship) {
    return { columnNames: [], values: [] };
  }

  MediaAssetAuthorshipContextSchema.parse(authorship);
  const bindings = actorRefToSqlBindings(authorship.actor);
  return {
    columnNames: STAMPING_ASSET_ROW_COLUMN_NAMES,
    values: [
      bindings.id,
      bindings.username,
      bindings.email,
      bindings.id,
      bindings.username,
      bindings.email,
    ],
  };
}

export function appendMediaAuthorshipUpdateSets(
  baseSetClauses: readonly string[],
  baseValues: readonly unknown[],
  mutationKind: MediaAuthorshipMutationKind,
  authorship: MediaAssetAuthorshipContext | undefined,
): { setClauses: string; values: unknown[] } {
  const patch = buildMediaAuthorshipPatch(mutationKind, authorship);
  return {
    setClauses: [...baseSetClauses, ...patch.setClauses].join(", "),
    values: [...baseValues, ...patch.values],
  };
}

export function appendSqlFragment(
  baseColumns: readonly string[],
  baseValues: readonly unknown[],
  fragment: SqlFragment,
): { columns: string[]; values: unknown[] } {
  return {
    columns: [...baseColumns, ...fragment.columnNames],
    values: [...baseValues, ...fragment.values],
  };
}

export function buildAuthorshipSaveContext(
  user: SessionUser,
  mutationKind: ContentMutationKind,
): AuthorshipSaveContext {
  return AuthorshipSaveContextSchema.parse({
    actor: sessionUserToActorRef(user),
    mutationKind: ContentMutationKindSchema.parse(mutationKind),
  });
}

export function buildSystemAuthorshipSaveContext(
  mutationKind: ContentMutationKind,
): AuthorshipSaveContext {
  return AuthorshipSaveContextSchema.parse({
    actor: ActorRefSchema.parse(SYSTEM_ACTOR),
    mutationKind: ContentMutationKindSchema.parse(mutationKind),
  });
}

export function buildMediaAuthorshipContext(
  actor: ActorRef,
  mutationKind: MediaAuthorshipMutationKind,
): MediaAssetAuthorshipContext {
  return MediaAssetAuthorshipContextSchema.parse({
    actor: ActorRefSchema.parse(actor),
    mutationKind,
  });
}

export function buildMediaAuthorshipContextFromSession(
  user: SessionUser,
  mutationKind: MediaAuthorshipMutationKind,
): MediaAssetAuthorshipContext {
  return buildMediaAuthorshipContext(sessionUserToActorRef(user), mutationKind);
}

/** Guard for tests: stamping helpers never emit UPDATE on version authorship columns. */
export function assertNoVersionAuthorshipUpdateSql(sql: string): void {
  const normalized = sql.toLowerCase();
  if (
    normalized.includes("update") &&
    VERSION_AUTHORSHIP_COLUMNS.some((column) => normalized.includes(column))
  ) {
    throw new Error("Version authorship columns must not appear in UPDATE SQL");
  }
}

export const StampingExportsForTests = {
  MEDIA_MUTATION_KINDS,
} as const;

export type { OperationId };
