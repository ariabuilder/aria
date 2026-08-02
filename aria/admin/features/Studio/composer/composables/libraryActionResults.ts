import { z } from "zod";

import { log } from "@/lib/utils/logger";
import { decodeRenderActionErrorMessage } from "../../../../../lib/rendering/actionErrorMessage";

export interface LibraryPackItem {
  id: string;
  name: string;
  description?: string;
  version: string;
  minAppVersion?: string;
  tier: "free" | "pro";
  componentIds: string[];
  thumbnail?: string;
  tags?: string[];
  publishedAt: string;
  checksum?: string;
  installState: "not_installed" | "partial" | "installed";
  installedComponentCount: number;
  installed: boolean;
  installedVersion?: string;
  updateAvailable: boolean;
}

interface LibraryActionTransportErrorLike {
  message?: string;
}

interface LibraryActionTransportResult {
  data?: unknown;
  error?: LibraryActionTransportErrorLike | null;
}

const LibraryPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  minAppVersion: z.string().optional(),
  tier: z.enum(["free", "pro"]),
  componentIds: z.array(z.string()),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string(),
  checksum: z.string().optional(),
  installState: z.enum(["not_installed", "partial", "installed"]),
  installedComponentCount: z.number(),
  installed: z.boolean(),
  installedVersion: z.string().optional(),
  updateAvailable: z.boolean(),
});

const LibraryCatalogSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    registryVersion: z.string(),
    updatedAt: z.string(),
    packs: z.array(LibraryPackSchema),
  }),
});

const LibraryActionErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

const LibraryActionFailureSchema = z.object({
  success: z.literal(false),
  error: LibraryActionErrorSchema,
});

const LibraryInstalledSummarySchema = z.object({
  packId: z.string(),
  name: z.string(),
  tier: z.enum(["free", "pro"]),
  version: z.string(),
  componentCount: z.number(),
  installedAt: z.string(),
});

const LibraryInstalledSuccessSchema = z.object({
  success: z.literal(true),
  data: z.array(LibraryInstalledSummarySchema),
});

const LibraryPackComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  source: z.enum(["custom", "aria"]).optional(),
  tier: z.enum(["free", "pro"]).optional(),
  isLocked: z.boolean().optional(),
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  version: z.string().optional(),
});

const LibraryPackManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  minAppVersion: z.string().optional(),
  tier: z.enum(["free", "pro"]),
  componentIds: z.array(z.string()),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string(),
  checksum: z.string().optional(),
});

const LibraryPackDetailsSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    manifest: LibraryPackManifestSchema,
    components: z.array(LibraryPackComponentSchema),
  }),
});

const LibraryInstallPackSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    packId: z.string(),
    version: z.string(),
    componentCount: z.number(),
    componentIds: z.array(z.string()),
  }),
});

const LibraryUninstallPackSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    packId: z.string(),
    removedCount: z.number(),
    removedComponentIds: z.array(z.string()),
  }),
});

const LibraryInstallComponentSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    packId: z.string(),
    componentId: z.string(),
    version: z.string(),
    action: z.enum(["installed", "already_installed"]),
  }),
});

export type LibraryInstalledSummary = z.infer<
  typeof LibraryInstalledSummarySchema
>;
export type LibraryPackComponent = z.infer<typeof LibraryPackComponentSchema>;
export type LibraryInstallPackSuccess = z.infer<
  typeof LibraryInstallPackSuccessSchema
>;
export type LibraryUninstallPackSuccess = z.infer<
  typeof LibraryUninstallPackSuccessSchema
>;
export type LibraryInstallComponentSuccess = z.infer<
  typeof LibraryInstallComponentSuccessSchema
>;

function getTransportErrorMessage(
  result: LibraryActionTransportResult,
  fallback: string,
): string {
  return (
    decodeRenderActionErrorMessage(result.error?.message)?.message ??
    result.error?.message ??
    fallback
  );
}

export function toLibraryErrorMessage(
  errorLike: unknown,
  fallback: string,
): string {
  const parsed = LibraryActionFailureSchema.safeParse(errorLike);
  if (parsed.success) {
    return parsed.data.error.message;
  }

  return fallback;
}

function unwrapLibraryActionResult<TSchema extends z.ZodTypeAny>(
  result: LibraryActionTransportResult,
  schema: TSchema,
  fallback: string,
  invalidMessage: string,
  context: Record<string, unknown> = {},
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; error: string } {
  if (result.error || !result.data) {
    return {
      success: false,
      error: getTransportErrorMessage(result, fallback),
    };
  }

  const parsedSuccess = schema.safeParse(result.data);
  if (parsedSuccess.success) {
    return {
      success: true,
      data: parsedSuccess.data,
    };
  }

  const parsedFailure = LibraryActionFailureSchema.safeParse(result.data);
  if (parsedFailure.success) {
    return {
      success: false,
      error: parsedFailure.data.error.message,
    };
  }

  log("warn", invalidMessage, {
    issues: parsedSuccess.error.issues,
    ...context,
  });

  return {
    success: false,
    error: fallback,
  };
}

export function unwrapLibraryInstalledResult(
  result: LibraryActionTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryInstalledSuccessSchema,
    "Failed to load installed Aria Library packs",
    "[StudioLibrary] Invalid installed packs response",
    context,
  );
}

export function unwrapLibraryCatalogResult(
  result: LibraryActionTransportResult,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryCatalogSuccessSchema,
    "Failed to load Aria Library",
    "[StudioLibrary] Invalid library catalog response",
    context,
  );
}

export function unwrapLibraryPackDetailsResult(
  result: LibraryActionTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryPackDetailsSuccessSchema,
    fallback,
    "[StudioLibrary] Invalid pack details response",
    context,
  );
}

export function unwrapLibraryInstallPackResult(
  result: LibraryActionTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryInstallPackSuccessSchema,
    fallback,
    "[StudioLibrary] Invalid install pack response",
    context,
  );
}

export function unwrapLibraryUninstallPackResult(
  result: LibraryActionTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryUninstallPackSuccessSchema,
    fallback,
    "[StudioLibrary] Invalid uninstall pack response",
    context,
  );
}

export function unwrapLibraryInstallComponentResult(
  result: LibraryActionTransportResult,
  fallback: string,
  context: Record<string, unknown> = {},
) {
  return unwrapLibraryActionResult(
    result,
    LibraryInstallComponentSuccessSchema,
    fallback,
    "[StudioLibrary] Invalid install component response",
    context,
  );
}
