import { createHash } from "node:crypto";
import { getStorageAdapterAsync } from "../../lib/storage/getStorageAdapter";
import {
  createDefaultUniversalDesignSystem,
  type UniversalDesignSystem,
} from "../../lib/styles/universalDesignSystem";
import { type AuthoringMode } from "../../lib/schemas/classEditor";
import type { AuthorshipSaveContext } from "../_shared";
import { persistDesignSystem } from "../_designSystemPersist";
import { log as baseLog } from "../../lib/utils/logger";

export type StylesStorageAdapter = Awaited<
  ReturnType<typeof getStorageAdapterAsync>
>;

type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const prefix = `[Aria Styles][${level.toUpperCase()}]`;

  baseLog(level, `${prefix} ${message}`, context);
}

const performanceMetrics = new Map<string, { startTime: number }>();

export function startPerformanceTracking(operation: string): void {
  performanceMetrics.set(operation, { startTime: performance.now() });
}

export function endPerformanceTracking(operation: string): number {
  const metrics = performanceMetrics.get(operation);
  if (!metrics) return 0;

  const duration = Math.round(performance.now() - metrics.startTime);
  performanceMetrics.delete(operation);
  return duration;
}

export function generateCSSHash(css: string): string {
  return createHash("sha256").update(css).digest("hex").slice(0, 12);
}

export async function getDesignSystem(
  adapter: StylesStorageAdapter,
): Promise<UniversalDesignSystem> {
  return (
    (await adapter.getDesignSystem()) ?? createDefaultUniversalDesignSystem()
  );
}

export async function saveDesignSystem(
  adapter: StylesStorageAdapter,
  designSystem: UniversalDesignSystem,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  await persistDesignSystem(adapter, designSystem, authorship);
}

export async function saveAuthoringMode(
  adapter: StylesStorageAdapter,
  mode: AuthoringMode,
  authorship?: AuthorshipSaveContext,
): Promise<void> {
  const designSystem = await getDesignSystem(adapter);
  designSystem.authoring.preferredMode = mode;
  await saveDesignSystem(adapter, designSystem, authorship);
}
