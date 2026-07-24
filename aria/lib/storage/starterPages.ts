import fs from "fs/promises";
import path from "path";

import { validatePageDSL } from "../schemas/nodes";
import type { PageDSL } from "../types/nodes";

export const STARTER_PAGE_ID = "index";

export type StarterPageSeed = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  layout: string | null;
  version: string;
  updatedAt: string;
  dsl: PageDSL;
};

function normalizeVersion(rawVersion: unknown, fallbackIso: string): string {
  if (typeof rawVersion === "string" && rawVersion.trim().length > 0) {
    return rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
  }

  if (typeof rawVersion === "number" && Number.isFinite(rawVersion)) {
    return String(Math.trunc(rawVersion));
  }

  const fallbackTimestamp = Date.parse(fallbackIso);
  if (Number.isFinite(fallbackTimestamp) && fallbackTimestamp > 0) {
    return String(fallbackTimestamp);
  }

  return String(Date.now());
}

export async function loadStarterPage(
  baseDir = process.cwd(),
): Promise<StarterPageSeed> {
  const pageDir = path.resolve(
    baseDir,
    "aria/storage/dsl/pages",
    STARTER_PAGE_ID,
  );
  const metaPath = path.join(pageDir, "meta.json");
  const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const updatedAt =
    typeof meta.updatedAt === "string" && meta.updatedAt.trim().length > 0
      ? meta.updatedAt
      : new Date().toISOString();
  const version = normalizeVersion(meta.currentVersion, updatedAt);
  const versionFilePath = path.join(pageDir, `v${version}.json`);
  const parsed = JSON.parse(await fs.readFile(versionFilePath, "utf-8"));
  const validation = validatePageDSL(parsed);

  if (!validation.success) {
    throw new Error(
      `Invalid starter page ${STARTER_PAGE_ID}: ${validation.error.message}`,
    );
  }

  const validatedDsl = validation.data as PageDSL;
  const metadataStatus =
    meta.status === "published" || meta.status === "archived"
      ? meta.status
      : null;
  const versionStatus =
    validatedDsl.status === "published" || validatedDsl.status === "archived"
      ? validatedDsl.status
      : null;
  const status =
    metadataStatus ?? versionStatus ?? "draft";
  const dsl: PageDSL = { ...validatedDsl, status };

  return {
    id: dsl.id,
    slug: dsl.slug,
    title: dsl.title,
    status,
    layout:
      typeof dsl.layout === "string" && dsl.layout.trim().length > 0
        ? dsl.layout
        : null,
    version,
    updatedAt,
    dsl,
  };
}
