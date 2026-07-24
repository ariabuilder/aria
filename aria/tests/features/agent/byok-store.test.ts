import { describe, expect, it } from "vitest";
import type { AuthAdapter } from "../../../lib/auth/adapter";
import {
  AGENT_BYOK_MASTER_KEY_CONFIG,
  getAgentCredentialsKey,
} from "../../../admin/features/Agent/lib/constants";
import {
  clearProviderCredentials,
  diagnoseProviderCredentials,
  hasProviderCredentials,
  loadProviderCredentials,
  saveProviderCredentials,
} from "../../../admin/features/Agent/lib/inference/byokStore";

function createMemoryAuthAdapter(): AuthAdapter {
  const configs = new Map<string, unknown>();

  return {
    getConfig: async <T>(key: string) =>
      (configs.get(key) as T | undefined) ?? null,
    setConfig: async <T>(key: string, value: T) => {
      configs.set(key, value);
    },
    deleteConfig: async (key: string) => {
      configs.delete(key);
    },
  } as AuthAdapter;
}

describe("provider credential storage", () => {
  it("stores credentials per backend", async () => {
    const adapter = createMemoryAuthAdapter();

    await saveProviderCredentials(adapter, {
      provider: "opencode",
      apiKey: "test-key",
    });
    expect(await hasProviderCredentials(adapter, "opencode")).toBe(true);
    expect(await hasProviderCredentials(adapter, "openai")).toBe(false);

    await clearProviderCredentials(adapter, "opencode");
    expect(await hasProviderCredentials(adapter, "opencode")).toBe(false);
  });

  it("uses distinct config keys per backend", () => {
    expect(getAgentCredentialsKey("opencode")).toBe(
      "agent_credentials_opencode",
    );
    expect(getAgentCredentialsKey("openai")).toBe("agent_credentials_openai");
    expect(getAgentCredentialsKey("anthropic")).toBe(
      "agent_credentials_anthropic",
    );
    expect(getAgentCredentialsKey("google")).toBe("agent_credentials_google");
    expect(getAgentCredentialsKey("openrouter")).toBe(
      "agent_credentials_openrouter",
    );
  });

  it("round-trips save and load", async () => {
    const adapter = createMemoryAuthAdapter();

    await saveProviderCredentials(adapter, {
      provider: "openai",
      apiKey: "sk-test-round-trip",
    });

    const loaded = await loadProviderCredentials(adapter, "openai");
    expect(loaded?.apiKey).toBe("sk-test-round-trip");
    expect(loaded?.updatedAt).toBeTruthy();
  });

  it("reports missing master key when ciphertext remains", async () => {
    const adapter = createMemoryAuthAdapter();

    await saveProviderCredentials(adapter, {
      provider: "opencode",
      apiKey: "orphaned-key",
    });
    await adapter.deleteConfig(AGENT_BYOK_MASTER_KEY_CONFIG);

    expect(await hasProviderCredentials(adapter, "opencode")).toBe(false);

    const diagnosis = await diagnoseProviderCredentials(adapter, "opencode");
    expect(diagnosis.hasPayload).toBe(true);
    expect(diagnosis.configured).toBe(false);
    expect(diagnosis.loadFailure).toBe("missing_master_key");
  });

  it("recovers after re-saving when master key was lost", async () => {
    const adapter = createMemoryAuthAdapter();

    await saveProviderCredentials(adapter, {
      provider: "opencode",
      apiKey: "first-key",
    });
    await adapter.deleteConfig(AGENT_BYOK_MASTER_KEY_CONFIG);

    expect(await hasProviderCredentials(adapter, "opencode")).toBe(false);

    await saveProviderCredentials(adapter, {
      provider: "opencode",
      apiKey: "replacement-key",
    });

    const loaded = await loadProviderCredentials(adapter, "opencode");
    expect(loaded?.apiKey).toBe("replacement-key");
    expect(await hasProviderCredentials(adapter, "opencode")).toBe(true);
  });
});
