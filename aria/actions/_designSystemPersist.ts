/**
 * Authorship-aware singleton persistence for design system and site settings.
 */

import type {
  AuthorshipSaveContext,
  SiteSettings,
  StorageAdapter,
} from "../lib/storage/adapter";
import type { CacheInvalidationJob } from "../lib/localization/siteTranslationSchemas";
import {
  createDefaultUniversalDesignSystem,
  validateUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../lib/styles/universalDesignSystem";

export async function getDesignSystem(
  adapter: Pick<StorageAdapter, "getDesignSystem">,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystem()) ?? createDefaultUniversalDesignSystem()
  );
}

export async function persistDesignSystem(
  adapter: StorageAdapter,
  data: UniversalDesignSystem,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  await adapter.saveDesignSystem(
    validateUniversalDesignSystem(data),
    authorship,
  );
}

export async function persistSiteSettings(
  adapter: StorageAdapter,
  data: SiteSettings,
  authorship?: AuthorshipSaveContext,
  invalidationJobs: readonly CacheInvalidationJob[] = [],
): Promise<void> {
  if (invalidationJobs.length > 0) {
    await adapter.saveSiteSettingsWithInvalidationJobs(
      data,
      invalidationJobs,
      authorship,
    );
    return;
  }
  await adapter.saveSiteSettings(data, authorship);
}
