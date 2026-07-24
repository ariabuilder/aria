import { z } from "zod";

export const ExternalMcpTrustTierSchema = z.literal("read_only");
export type ExternalMcpTrustTier = z.infer<
  typeof ExternalMcpTrustTierSchema
>;

export const ExternalMcpConnectionSchema = z
  .object({
    id: z.uuid(),
    siteId: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    serverUrl: z.url().max(2048),
    trustTier: ExternalMcpTrustTierSchema,
    enabled: z.boolean(),
    serverIdentity: z.string().min(1).nullable(),
    manifestFingerprint: z.string().min(1).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type ExternalMcpConnection = z.infer<
  typeof ExternalMcpConnectionSchema
>;

export const CreateExternalMcpConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    serverUrl: z.url().max(2048),
  })
  .strict();

export const UpdateExternalMcpConnectionInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(100).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const DeleteExternalMcpConnectionInputSchema = z
  .object({ id: z.uuid() })
  .strict();

export const DiscoverExternalMcpConnectionInputSchema = z
  .object({ id: z.uuid() })
  .strict();

export const ExternalMcpToolSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    inputSchema: z.record(z.string(), z.unknown()),
    readOnly: z.boolean(),
  })
  .strict();

export const ExternalMcpDiscoveryResultSchema = z
  .object({
    serverIdentity: z.string().min(1),
    manifestFingerprint: z.string().min(1),
    tools: z.array(ExternalMcpToolSchema),
  })
  .strict();
export type ExternalMcpDiscoveryResult = z.infer<
  typeof ExternalMcpDiscoveryResultSchema
>;

export const CallExternalMcpReadToolInputSchema = z
  .object({
    connectionId: z.uuid(),
    toolName: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const ExternalMcpReadResultSchema = z
  .object({
    source: z.literal("external_mcp"),
    connectionId: z.uuid(),
    serverIdentity: z.string().min(1),
    toolName: z.string().min(1),
    trust: z.literal("untrusted"),
    content: z.unknown(),
  })
  .strict();
export type ExternalMcpReadResult = z.infer<
  typeof ExternalMcpReadResultSchema
>;
