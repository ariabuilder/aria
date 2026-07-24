import fs from "fs/promises";
import path from "path";

import type { LayoutDSL } from "../types/nodes";
import { validateLayoutDSL } from "../schemas/nodes";
import { STARTER_LAYOUT_IDS } from "./starterLayoutIds";

export { STARTER_LAYOUT_IDS } from "./starterLayoutIds";

export type StarterLayoutSeed = {
  id: string;
  name: string;
  description: string | null;
  version: string;
  updatedAt: string;
  dsl: LayoutDSL;
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

export async function loadStarterLayouts(
  baseDir = process.cwd(),
): Promise<StarterLayoutSeed[]> {
  const layoutsDir = path.resolve(baseDir, "aria/storage/dsl/layouts");
  const seeds: StarterLayoutSeed[] = [];

  for (const id of STARTER_LAYOUT_IDS) {
    const filePath = path.join(layoutsDir, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const validation = validateLayoutDSL(parsed);

    if (!validation.success) {
      throw new Error(
        `Invalid starter layout ${id}: ${validation.error.message}`,
      );
    }

    const updatedAt =
      typeof parsed.updatedAt === "string" && parsed.updatedAt.trim().length > 0
        ? parsed.updatedAt
        : new Date().toISOString();

    seeds.push({
      id,
      name: typeof parsed.name === "string" ? parsed.name : id,
      description:
        typeof parsed.description === "string" ? parsed.description : null,
      version: normalizeVersion(parsed.version, updatedAt),
      updatedAt,
      dsl: validation.data as LayoutDSL,
    });
  }

  return seeds;
}
