import { describe, expect, it } from "vitest";

import type { AuthAdapter } from "../../../lib/auth/adapter";
import {
  CONFIG_KEYS,
  type AuthMethodsConfig,
} from "../../../lib/auth/types";
import {
  getAuthMethodsConfig,
  isAuthMethodEnabled,
  resolveAllowedOrigins,
  resolveExpectedRpIds,
  resolveRpId,
} from "../../../lib/auth/methods/registry";

type AuthConfigAdapter = Pick<AuthAdapter, "getConfig" | "setConfig">;

function createConfigAdapter(initial: Record<string, unknown> = {}): {
  adapter: AuthConfigAdapter;
  store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>(Object.entries(initial));
  const adapter: AuthConfigAdapter = {
    async getConfig<T>(key: string): Promise<T | null> {
      return (store.get(key) ?? null) as T | null;
    },
    async setConfig<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
    },
  };
  return { adapter, store };
}

describe("auth methods registry", () => {
  it("returns safe defaults when no config exists", async () => {
    const { adapter } = createConfigAdapter();

    const config = await getAuthMethodsConfig(adapter, {
      persistDefaultOrigins: false,
    });

    expect(config.passkey.enabled).toBe(true);
    expect(config.passkey.rpName).toBe("Aria");
    expect(config.magicLink.enabled).toBe(false);
    expect(config.password.enabled).toBe(true);
    expect(config.password.recoveryOnly).toBe(true);
    expect(config.cloudflareAccess.enabled).toBe(false);
  });

  it("merges partial stored config with defaults", async () => {
    const { adapter } = createConfigAdapter({
      [CONFIG_KEYS.AUTH_METHODS]: {
        passkey: {
          enabled: false,
        },
        magicLink: {
          enabled: true,
          expiryMinutes: 30,
        },
      },
    });

    const config = await getAuthMethodsConfig(adapter, {
      persistDefaultOrigins: false,
    });

    expect(config.passkey).toEqual({
      enabled: false,
      rpName: "Aria",
      allowedOrigins: [],
    });
    expect(config.magicLink).toEqual({
      enabled: true,
      expiryMinutes: 30,
    });
    expect(config.password.enabled).toBe(true);
  });

  it("seeds current and dev origins when passkey origins are empty", async () => {
    const { adapter, store } = createConfigAdapter();

    const config = await getAuthMethodsConfig(adapter, {
      requestUrl: "https://studio.example.com/admin/login",
      isDev: true,
    });

    expect(config.passkey.allowedOrigins).toEqual([
      "https://studio.example.com",
      "http://localhost:4321",
      "http://127.0.0.1:4321",
    ]);
    expect(store.get(CONFIG_KEYS.AUTH_METHODS)).toEqual(config);
  });

  it("does not overwrite malformed stored config while seeding origins", async () => {
    const malformedConfig = {
      passkey: {
        enabled: true,
        rpName: "Aria",
        allowedOrigins: [],
        futureField: true,
      },
      magicLink: {
        enabled: true,
        expiryMinutes: 20,
      },
    };
    const { adapter, store } = createConfigAdapter({
      [CONFIG_KEYS.AUTH_METHODS]: malformedConfig,
    });

    const config = await getAuthMethodsConfig(adapter, {
      requestUrl: "https://studio.example.com/admin/login",
      isDev: true,
    });

    expect(config.passkey.allowedOrigins).toEqual([
      "https://studio.example.com",
      "http://localhost:4321",
      "http://127.0.0.1:4321",
    ]);
    expect(config.magicLink.enabled).toBe(true);
    expect(config.magicLink.expiryMinutes).toBe(20);
    expect(store.get(CONFIG_KEYS.AUTH_METHODS)).toEqual(malformedConfig);
  });

  it("resolves RP ID and expected origins from request URLs", () => {
    const config = {
      passkey: {
        enabled: true,
        rpName: "Aria",
        allowedOrigins: ["https://admin.example.com"],
      },
      magicLink: { enabled: false, expiryMinutes: 15 },
      password: { enabled: true, recoveryOnly: true },
      oauth: {},
      cloudflareAccess: { enabled: false },
    } satisfies AuthMethodsConfig;

    expect(resolveRpId("https://admin.example.com:8443/admin")).toBe(
      "admin.example.com",
    );
    expect(resolveAllowedOrigins(config, "https://admin.example.com/admin")).toEqual([
      "https://admin.example.com",
    ]);
    expect(
      resolveAllowedOrigins(config, "http://localhost:4321/admin/login"),
    ).toEqual(["https://admin.example.com", "http://localhost:4321", "http://127.0.0.1:4321"]);
    expect(resolveExpectedRpIds("http://localhost:4321/admin/login")).toEqual([
      "localhost",
      "127.0.0.1",
    ]);
    expect(resolveExpectedRpIds("https://admin.example.com/admin")).toBe(
      "admin.example.com",
    );
  });

  it("checks enabled state for each auth method", async () => {
    const { adapter } = createConfigAdapter({
      [CONFIG_KEYS.AUTH_METHODS]: {
        oauth: {
          github: {
            enabled: true,
          },
        },
        cloudflareAccess: {
          enabled: true,
        },
      },
    });
    const config = await getAuthMethodsConfig(adapter, {
      persistDefaultOrigins: false,
    });

    expect(isAuthMethodEnabled(config, "passkey")).toBe(true);
    expect(isAuthMethodEnabled(config, "password")).toBe(true);
    expect(isAuthMethodEnabled(config, "magic_link")).toBe(false);
    expect(isAuthMethodEnabled(config, "oauth")).toBe(true);
    expect(isAuthMethodEnabled(config, "cloudflare_access")).toBe(true);
  });
});
