import type { AuthAdapter } from "../../../../../lib/auth/adapter";
import { log } from "../../../../../lib/utils/logger";
import {
  AGENT_BYOK_MASTER_KEY_CONFIG,
  getAgentCredentialsKey,
} from "../constants";
import { CREDENTIAL_BACKEND_IDS } from "../inferenceProviders";
import {
  EncryptedByokPayloadSchema,
  StoredProviderCredentialsSchema,
  type ConfiguredBackends,
  type CredentialBackendId,
  type StoredProviderCredentials,
  type UpdateAgentProviderInput,
} from "../schemas";
import {
  decryptSecret,
  encryptSecret,
  generateMasterKeyMaterial,
} from "./byokCrypto";

export type ByokCredentialLoadFailure =
  | "missing_payload"
  | "invalid_payload"
  | "missing_master_key"
  | "decrypt_failed"
  | "invalid_credentials";

export type ByokCredentialDiagnosis = {
  backend: CredentialBackendId;
  hasPayload: boolean;
  configured: boolean;
  loadFailure?: ByokCredentialLoadFailure;
};

function warnCredentialLoadFailure(
  backend: CredentialBackendId,
  reason: ByokCredentialLoadFailure,
): void {
  log("warn", "[Agent BYOK] Failed to load provider credentials", {
    backend,
    reason,
  });
}

async function getOrCreateMasterKey(adapter: AuthAdapter): Promise<string> {
  const existing = await adapter.getConfig<string>(AGENT_BYOK_MASTER_KEY_CONFIG);
  if (existing?.trim()) {
    return existing;
  }

  const generated = await generateMasterKeyMaterial();
  await adapter.setConfig(AGENT_BYOK_MASTER_KEY_CONFIG, generated);
  return generated;
}

async function hasStoredCredentialPayload(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<boolean> {
  const encrypted = await adapter.getConfig<unknown>(
    getAgentCredentialsKey(backend),
  );
  return encrypted != null;
}

async function loadEncryptedCredentials(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<StoredProviderCredentials | null> {
  const encrypted = await adapter.getConfig<unknown>(
    getAgentCredentialsKey(backend),
  );
  if (!encrypted) {
    return null;
  }

  const payload = EncryptedByokPayloadSchema.safeParse(encrypted);
  if (!payload.success) {
    warnCredentialLoadFailure(backend, "invalid_payload");
    return null;
  }

  const masterKey = await adapter.getConfig<string>(AGENT_BYOK_MASTER_KEY_CONFIG);
  if (!masterKey?.trim()) {
    warnCredentialLoadFailure(backend, "missing_master_key");
    return null;
  }

  try {
    const decrypted = await decryptSecret(masterKey, payload.data);
    const parsed = StoredProviderCredentialsSchema.safeParse(
      JSON.parse(decrypted),
    );
    if (!parsed.success) {
      warnCredentialLoadFailure(backend, "invalid_credentials");
      return null;
    }
    return parsed.data;
  } catch {
    warnCredentialLoadFailure(backend, "decrypt_failed");
    return null;
  }
}

export async function diagnoseProviderCredentials(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<ByokCredentialDiagnosis> {
  const hasPayload = await hasStoredCredentialPayload(adapter, backend);
  if (!hasPayload) {
    return { backend, hasPayload: false, configured: false };
  }

  const encrypted = await adapter.getConfig<unknown>(
    getAgentCredentialsKey(backend),
  );
  if (!encrypted) {
    return {
      backend,
      hasPayload: false,
      configured: false,
      loadFailure: "missing_payload",
    };
  }

  const payload = EncryptedByokPayloadSchema.safeParse(encrypted);
  if (!payload.success) {
    return {
      backend,
      hasPayload: true,
      configured: false,
      loadFailure: "invalid_payload",
    };
  }

  const masterKey = await adapter.getConfig<string>(AGENT_BYOK_MASTER_KEY_CONFIG);
  if (!masterKey?.trim()) {
    return {
      backend,
      hasPayload: true,
      configured: false,
      loadFailure: "missing_master_key",
    };
  }

  try {
    const decrypted = await decryptSecret(masterKey, payload.data);
    const parsed = StoredProviderCredentialsSchema.safeParse(
      JSON.parse(decrypted),
    );
    if (!parsed.success) {
      return {
        backend,
        hasPayload: true,
        configured: false,
        loadFailure: "invalid_credentials",
      };
    }
    return { backend, hasPayload: true, configured: true };
  } catch {
    return {
      backend,
      hasPayload: true,
      configured: false,
      loadFailure: "decrypt_failed",
    };
  }
}

export async function saveProviderCredentials(
  adapter: AuthAdapter,
  input: UpdateAgentProviderInput,
): Promise<void> {
  const masterKey = await getOrCreateMasterKey(adapter);
  const stored: StoredProviderCredentials = StoredProviderCredentialsSchema.parse(
    {
      apiKey: input.apiKey,
      baseUrl: input.baseUrl,
      updatedAt: new Date().toISOString(),
    },
  );
  const encrypted = await encryptSecret(masterKey, JSON.stringify(stored));
  await adapter.setConfig(
    getAgentCredentialsKey(input.provider),
    EncryptedByokPayloadSchema.parse(encrypted),
  );
}

export async function loadProviderCredentials(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<StoredProviderCredentials | null> {
  return loadEncryptedCredentials(adapter, backend);
}

export async function hasProviderCredentials(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<boolean> {
  const credentials = await loadProviderCredentials(adapter, backend);
  return credentials !== null;
}

export async function clearProviderCredentials(
  adapter: AuthAdapter,
  backend: CredentialBackendId,
): Promise<void> {
  await adapter.deleteConfig(getAgentCredentialsKey(backend));
}

export async function listConfiguredBackends(
  adapter: AuthAdapter,
): Promise<ConfiguredBackends> {
  const configured: ConfiguredBackends = {};

  await Promise.all(
    CREDENTIAL_BACKEND_IDS.map(async (backend) => {
      configured[backend] = await hasProviderCredentials(adapter, backend);
    }),
  );

  return configured;
}
