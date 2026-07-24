import { getApiSqlDatabase } from "../api/database";
import { ApiRepository } from "../api/repository";
import type { RuntimeLocals } from "../cloudflare/env";
import {
  assertCanonicalOAuthRequest,
  FIGMA_OAUTH_CLIENT_ID,
  readOAuthConfiguration,
  type OAuthConfiguration,
} from "./config";

export const INTEGRATIONS_DISCOVERY_PATH = "/.well-known/aria-integrations";
// Figma resource routes (migration 0008) do not exist yet: discovery stays in
// authorization-preview and publishes no import schema versions.
export const OAUTH_DISCOVERY_STATUS = "authorization_preview" as const;

export type IntegrationsDiscovery = Readonly<{
  schemaVersion: 1;
  siteId: string;
  canonicalOrigin: string;
  apiVersion: "v1";
  oauth: Readonly<{
    status: typeof OAUTH_DISCOVERY_STATUS;
    deviceAuthorizationEndpoint: string;
    tokenEndpoint: string;
    revocationEndpoint: string;
  }>;
  providers: Readonly<{
    figma: Readonly<{
      clientId: string;
      importSchemaVersions: readonly string[];
    }>;
  }>;
}>;

export function buildDiscoveryDocument(input: {
  configuration: OAuthConfiguration;
  siteId: string;
}): IntegrationsDiscovery {
  const origin = input.configuration.canonicalOrigin;
  return {
    schemaVersion: 1,
    siteId: input.siteId,
    canonicalOrigin: origin,
    apiVersion: "v1",
    oauth: {
      status: OAUTH_DISCOVERY_STATUS,
      deviceAuthorizationEndpoint: `${origin}/oauth/device/authorization`,
      tokenEndpoint: `${origin}/oauth/token`,
      revocationEndpoint: `${origin}/oauth/revoke`,
    },
    providers: {
      figma: {
        clientId: FIGMA_OAUTH_CLIENT_ID,
        importSchemaVersions: [],
      },
    },
  };
}

export async function buildIntegrationsDiscovery(input: {
  locals?: RuntimeLocals;
  request: Request;
}): Promise<IntegrationsDiscovery> {
  const configuration = readOAuthConfiguration(input.locals);
  assertCanonicalOAuthRequest(input.request, configuration);
  const database = await getApiSqlDatabase(input.locals);
  const siteId = await new ApiRepository(database).getOrCreateSiteIdentity();
  return buildDiscoveryDocument({ configuration, siteId });
}
