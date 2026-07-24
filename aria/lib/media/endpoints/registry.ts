import { getCloudflareEnv } from "../../cloudflare/env";
import type { RuntimeLocals } from "../../cloudflare/env";
import type { MediaEndpoint } from "../types";
import { LocalMediaEndpoint } from "./local";
import { CloudflareR2Endpoint, type CloudflareR2Bucket } from "./cloudflare-r2";
import {
  assertEndpointId,
  ENDPOINT_IDS,
  EndpointIdSchema,
  isEndpointId,
  type EndpointId,
} from "./ids";

export { ENDPOINT_IDS, EndpointIdSchema, assertEndpointId, type EndpointId };

export class MediaEndpointRegistry {
  constructor(private readonly locals?: RuntimeLocals) {}

  async get(id: EndpointId): Promise<MediaEndpoint> {
    if (id === "local-fs") {
      return new LocalMediaEndpoint();
    }

    const env = getCloudflareEnv(this.locals);
    const bucket = env?.aria_r2 as CloudflareR2Bucket | undefined;
    if (!bucket) {
      throw new Error(
        "R2 endpoint is not configured (missing aria_r2 binding)",
      );
    }

    const baseUrl =
      typeof env?.R2_PUBLIC_URL === "string" ? env.R2_PUBLIC_URL : "";

    return new CloudflareR2Endpoint({
      bucket,
      baseUrl,
    });
  }

  async list(): Promise<EndpointId[]> {
    const env = getCloudflareEnv(this.locals);
    const isDev = Boolean(import.meta.env?.DEV);
    const hasR2 = Boolean(env?.aria_r2);

    if (isDev) {
      return hasR2 ? ["local-fs", "cloudflare-r2"] : ["local-fs"];
    }

    return hasR2 ? ["cloudflare-r2"] : ["local-fs"];
  }

  async validate(id: string): Promise<boolean> {
    if (!isEndpointId(id)) return false;

    try {
      const endpoint = await this.get(id);
      await endpoint.list({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export async function getEndpointRegistry(
  locals?: RuntimeLocals,
): Promise<MediaEndpointRegistry> {
  return new MediaEndpointRegistry(locals);
}
