/**
 * Exposes adapter identity and infrastructure metrics to the Studio
 * dashboard. Each storage adapter optionally implements getAdapterInfo() and getAdapterMetrics().
 */

import { defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { requireAuth } from "./_shared";
import {
  AdapterInfoSchema,
  AdapterMetricsSchema,
  type AdapterInfo,
} from "../lib/storage/adapterMetricsSchemas";
import { log as baseLog } from "../lib/utils/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  baseLog(level, `[Aria Platform][${level.toUpperCase()}] ${message}`, context);
}

const LOCAL_FALLBACK_INFO: AdapterInfo = {
  platform: "local",
  displayName: "Local Filesystem",
  capabilities: {
    database: false,
    kv: false,
    objectStorage: false,
    edgeNetwork: false,
    deploymentApi: false,
  },
};

export const platform = {
  /**
   * Get adapter identity and capabilities.
   * Returns a stable descriptor: which platform is running and what it supports.
   */
  info: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        if (typeof adapter.getAdapterInfo === "function") {
          return AdapterInfoSchema.parse(await adapter.getAdapterInfo());
        }

        return AdapterInfoSchema.parse(LOCAL_FALLBACK_INFO);
      } catch (error) {
        log("warn", "Failed to get adapter info, returning fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
        return AdapterInfoSchema.parse(LOCAL_FALLBACK_INFO);
      }
    },
  }),

  /**
   * Get live infrastructure metrics from the active adapter.
   * Returns null when the adapter does not support metrics.
   */
  metrics: defineAction({
    accept: "json",
    input: z.object({}),
    handler: async (_input, context) => {
      await requireAuth(context);

      try {
        const adapter = await getStorageAdapterAsync(context.locals);

        if (typeof adapter.getAdapterMetrics === "function") {
          return AdapterMetricsSchema.parse(await adapter.getAdapterMetrics());
        }

        return null;
      } catch (error) {
        log("warn", "Failed to get adapter metrics", {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  }),
};
