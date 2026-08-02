import type { PageDSL } from "../../../types/nodes";
import type {
  StoredMediaUsageKind,
  StoredPageAccessMode,
  StoredPageSystemRole,
} from "../../adapter";

export type StoredVersionTable =
  | "aria_page_versions"
  | "aria_layout_versions"
  | "aria_component_versions";

export type StoredVersionRow = {
  dslJson: string;
  contentHash: string | null;
};

export type ResolvedVersionState = {
  id: string;
  currentVersion: string;
};

export type ResolvedPageIdentity = ResolvedVersionState & {
  status: string | null;
  systemRole: StoredPageSystemRole | null;
  accessMode: StoredPageAccessMode | null;
  draftVersion: string | null;
  publishedVersion: string | null;
};

export type SharedVersionStorageContext = {
  normalizeVersion(version?: string): string | undefined;
  resolvePageIdentity(idOrSlug: string): Promise<ResolvedPageIdentity | null>;
  resolveLayoutVersionState(
    idOrName: string,
  ): Promise<ResolvedVersionState | null>;
  resolveComponentVersionState(
    idOrName: string,
  ): Promise<ResolvedVersionState | null>;
  getStoredVersionRow(
    tableName: StoredVersionTable,
    id: string,
    version: string,
  ): Promise<StoredVersionRow | null>;
  resolveStoredVersionContentHash(input: StoredVersionRow): Promise<string>;
  syncPageUsage(id: string, dsl: PageDSL): Promise<void>;
  syncMediaUsageBestEffort(
    kind: StoredMediaUsageKind,
    id: string,
    dsl: unknown,
  ): Promise<void>;
  pruneStoredVersionHistory(
    resourceType: "page" | "layout" | "component",
    resourceId: string,
  ): Promise<void>;
};
