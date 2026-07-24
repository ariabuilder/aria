import { z } from "zod";

export const ENDPOINT_IDS = ["local-fs", "cloudflare-r2"] as const;

export const EndpointIdSchema = z.enum(ENDPOINT_IDS);

export type EndpointId = z.infer<typeof EndpointIdSchema>;

const ENDPOINT_ID_SET: ReadonlySet<EndpointId> = new Set(ENDPOINT_IDS);

export function isEndpointId(value: string): value is EndpointId {
  return ENDPOINT_ID_SET.has(value as EndpointId);
}

export function assertEndpointId(id: string): asserts id is EndpointId {
  if (!isEndpointId(id)) {
    throw new Error(`Unsupported endpoint id: ${id}`);
  }
}
