import { z } from "zod";
import {
  InferenceBackendIdSchema,
  InferenceRouteSchema,
} from "../schemas";

export const InferenceRequestMetadataSchema = z
  .object({
    siteId: z.string().min(1),
    userId: z.string().min(1),
    requestId: z.string().min(1),
    turnId: z.string().min(1),
    feature: z.string().min(1),
  })
  .strict();
export type InferenceRequestMetadata = z.infer<
  typeof InferenceRequestMetadataSchema
>;

const GatewayRequestConfigSchema = z
  .object({
    baseURL: z.url(),
    headers: z.record(z.string(), z.string()),
  })
  .strict();
export type GatewayRequestConfig = z.infer<
  typeof GatewayRequestConfigSchema
>;

async function opaqueId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, 32);
}

export async function buildCloudflareGatewayRequestConfig(input: {
  route: z.input<typeof InferenceRouteSchema>;
  backend: z.input<typeof InferenceBackendIdSchema>;
  metadata: InferenceRequestMetadata;
}): Promise<GatewayRequestConfig | null> {
  const route = InferenceRouteSchema.parse(input.route);
  const backend = InferenceBackendIdSchema.parse(input.backend);
  const metadata = InferenceRequestMetadataSchema.parse(input.metadata);
  if (route.type === "direct") return null;
  if (backend !== "openai" && backend !== "openrouter") {
    throw new Error(
      `Cloudflare AI Gateway routing is unsupported for ${backend}`,
    );
  }
  const providerPath = backend === "openai" ? "openai" : "openrouter";
  const gatewayMetadata = {
    site_id: await opaqueId(metadata.siteId),
    user_id: await opaqueId(metadata.userId),
    request_id: metadata.requestId,
    turn_id: metadata.turnId,
    feature: metadata.feature,
  };
  return GatewayRequestConfigSchema.parse({
    baseURL: `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(route.accountId)}/${encodeURIComponent(route.gatewayId)}/${providerPath}`,
    headers: {
      "cf-aig-metadata": JSON.stringify(gatewayMetadata),
      "cf-aig-collect-log-payload": String(route.collectLogPayload),
    },
  });
}
