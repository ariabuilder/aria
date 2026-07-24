import { describe, expect, it } from "vitest";

import { readOAuthConfiguration } from "../../lib/oauth/config";
import {
  buildDiscoveryDocument,
  OAUTH_DISCOVERY_STATUS,
} from "../../lib/oauth/discovery";

const keyBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
let keyBinary = "";
for (const byte of keyBytes) keyBinary += String.fromCharCode(byte);
const keyBase64 = btoa(keyBinary);

const locals = {
  cfBindings: {
    ARIA_API_KEYRING_KEY_ID: "v1",
    ARIA_API_KEYRING_KEY_V1: keyBase64,
    ARIA_OAUTH_ENABLED: "true",
    ARIA_CANONICAL_ORIGIN: "https://site.example",
  },
};

describe("integrations discovery document", () => {
  it("publishes only public identity and absolute OAuth endpoints", () => {
    const document = buildDiscoveryDocument({
      configuration: readOAuthConfiguration(locals),
      siteId: "3f6b2a52-9c4d-4a2f-9b4a-2f0d1d2c3b4a",
    });

    expect(document).toEqual({
      schemaVersion: 1,
      siteId: "3f6b2a52-9c4d-4a2f-9b4a-2f0d1d2c3b4a",
      canonicalOrigin: "https://site.example",
      apiVersion: "v1",
      oauth: {
        status: OAUTH_DISCOVERY_STATUS,
        deviceAuthorizationEndpoint:
          "https://site.example/oauth/device/authorization",
        tokenEndpoint: "https://site.example/oauth/token",
        revocationEndpoint: "https://site.example/oauth/revoke",
      },
      providers: {
        figma: {
          clientId: "aria-figma-plugin",
          importSchemaVersions: [],
        },
      },
    });
    // No token material, user data, or key material may appear in discovery.
    expect(JSON.stringify(document)).not.toContain(keyBase64);
  });

  it("stays in authorization preview until Figma resource routes exist", () => {
    const document = buildDiscoveryDocument({
      configuration: readOAuthConfiguration(locals),
      siteId: "3f6b2a52-9c4d-4a2f-9b4a-2f0d1d2c3b4a",
    });

    expect(document.oauth.status).toBe("authorization_preview");
    expect(document.providers.figma.importSchemaVersions).toEqual([]);
  });
});
