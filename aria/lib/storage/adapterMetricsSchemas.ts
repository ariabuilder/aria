/**
 * Zod schemas for adapter identity and infrastructure metrics.
 * Single source of truth — types are z.
 */

import { z } from "zod";

export const AdapterPlatformSchema = z.enum(["cloudflare", "local"]);

export const AdapterCapabilitiesSchema = z.object({
  database: z.boolean(),
  kv: z.boolean(),
  objectStorage: z.boolean(),
  edgeNetwork: z.boolean(),
  deploymentApi: z.boolean(),
});

export const AdapterInfoSchema = z.object({
  platform: AdapterPlatformSchema,
  displayName: z.string().min(1),
  capabilities: AdapterCapabilitiesSchema,
  region: z.string().optional(),
});

export const AdapterNetworkStatusSchema = z.enum([
  "online",
  "degraded",
  "offline",
]);

export const AdapterNetworkDomainStatusSchema = z.enum([
  "active",
  "pending",
  "error",
]);

export const AdapterNetworkDomainSchema = z.object({
  host: z.string().min(1),
  status: AdapterNetworkDomainStatusSchema,
});

export const AdapterNetworkMetricsSchema = z.object({
  status: AdapterNetworkStatusSchema,
  ddosProtection: z.boolean(),
  globalCdn: z.boolean(),
  edgeCaching: z.boolean(),
  sslEnabled: z.boolean().optional(),
  wafEnabled: z.boolean().optional(),
  botProtection: z.boolean().optional(),
  domains: z.array(AdapterNetworkDomainSchema).optional(),
});

export const AdapterStorageDatabaseSchema = z.object({
  rowCount: z.int().nonnegative(),
  label: z.string().min(1),
});

export const AdapterStorageKvSchema = z.object({
  available: z.boolean(),
  label: z.string().min(1),
});

export const AdapterStorageObjectSchema = z.object({
  objectCount: z.int().nonnegative(),
  label: z.string().min(1),
});

export const AdapterStorageMetricsSchema = z.object({
  database: AdapterStorageDatabaseSchema.optional(),
  kv: AdapterStorageKvSchema.optional(),
  objectStorage: AdapterStorageObjectSchema.optional(),
});

export const AdapterDeploymentStatusSchema = z.enum([
  "ready",
  "building",
  "failed",
]);

export const AdapterDeploymentMetricsSchema = z.object({
  lastDeployedAt: z.string().nullable(),
  lastStatus: AdapterDeploymentStatusSchema.nullable(),
  totalDeployments: z.int().nonnegative(),
});

export const AdapterMetricsSchema = z.object({
  platform: AdapterPlatformSchema,
  capturedAt: z.string().min(1),
  network: AdapterNetworkMetricsSchema.optional(),
  storage: AdapterStorageMetricsSchema.optional(),
  deployments: AdapterDeploymentMetricsSchema.optional(),
});

export type AdapterPlatform = z.infer<typeof AdapterPlatformSchema>;
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;
export type AdapterInfo = z.infer<typeof AdapterInfoSchema>;
export type AdapterNetworkMetrics = z.infer<typeof AdapterNetworkMetricsSchema>;
export type AdapterStorageMetrics = z.infer<typeof AdapterStorageMetricsSchema>;
export type AdapterDeploymentMetrics = z.infer<
  typeof AdapterDeploymentMetricsSchema
>;
export type AdapterMetrics = z.infer<typeof AdapterMetricsSchema>;
