import type { SessionUser } from "../auth/types";
import {
  ApiCredentialPublicSchema,
  CreatedApiCredentialSchema,
  type ApiCredentialKind,
  type ApiScope,
  type CreatedApiCredential,
} from "./schemas";
import { createRawApiToken, hmacApiValue, type ApiKeyring } from "./crypto";
import type { ApiRepository } from "./repository";

export async function createApiCredential(input: {
  repository: ApiRepository;
  keyring: ApiKeyring;
  actor: SessionUser;
  principalId: string;
  kind: ApiCredentialKind;
  name: string;
  scopes: readonly ApiScope[];
  expiresAt: string | null;
}): Promise<CreatedApiCredential> {
  const siteId = await input.repository.getOrCreateSiteIdentity();
  const { token, prefix } = createRawApiToken();
  const credential = await input.repository.insertCredentialWithAudit({
    id: crypto.randomUUID(),
    siteId,
    kind: input.kind,
    principalId: input.principalId,
    createdById: input.actor.id,
    name: input.name,
    tokenPrefix: prefix,
    tokenDigest: await hmacApiValue(input.keyring, "credential", token),
    keyId: input.keyring.keyId,
    scopes: input.scopes,
    expiresAt: input.expiresAt,
    requestId: crypto.randomUUID(),
  });
  return CreatedApiCredentialSchema.parse({
    credential: ApiCredentialPublicSchema.parse(credential),
    token,
  });
}
