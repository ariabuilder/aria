import { ActionError, defineAction } from "astro:actions";
import { z } from "zod";
import {
  hasEffectiveCapability,
  requireAuth,
  requireCapability,
} from "../lib/auth";
import { getAuthAdapterAsync } from "../lib/auth/getAuthAdapter";
import { SessionUserSchema } from "../lib/auth/types";
import { readApiKeyring } from "../lib/api/crypto";
import { createApiCredential } from "../lib/api/credentials";
import { getApiSqlDatabase } from "../lib/api/database";
import { ApiRepository } from "../lib/api/repository";
import {
  ApiCredentialPublicSchema,
  CreateApiCredentialInputSchema,
} from "../lib/api/schemas";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";

const EmptyInputSchema = z.object({}).strict();
const RevokeInputSchema = z.object({ id: z.uuid() }).strict();
const RemoveInputSchema = z.object({ id: z.uuid() }).strict();
const API_KEYRING_CONFIGURATION_ERRORS = new Set([
  "API_KEYRING_KEY_ID_UNAVAILABLE",
  "API_KEYRING_KEY_ID_INVALID",
  "API_KEYRING_KEY_UNAVAILABLE",
  "API_KEYRING_KEY_INVALID",
]);

function isApiKeyringConfigurationError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    API_KEYRING_CONFIGURATION_ERRORS.has(cause.message)
  );
}

async function repositoryFor(locals: App.Locals): Promise<ApiRepository> {
  const storage = await getStorageAdapterAsync(locals);
  await storage.getSiteSettings();
  return new ApiRepository(await getApiSqlDatabase(locals));
}

function assertScopesAllowed(
  user: Awaited<ReturnType<typeof requireAuth>>,
  scopes: readonly string[],
): void {
  const needsCms = scopes.some((scope) => scope !== "entries:publish");
  if (needsCms && !hasEffectiveCapability(user, "editCms")) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Requested API scopes exceed the principal's CMS capability",
    });
  }
  if (
    scopes.includes("entries:publish") &&
    !hasEffectiveCapability(user, "publishContent") &&
    !hasEffectiveCapability(user, "unpublishContent")
  ) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "Requested publish scope exceeds the principal's capability",
    });
  }
}

export const apiTokens = {
  status: defineAction({
    accept: "json",
    input: EmptyInputSchema,
    handler: async (_, context) => {
      await requireAuth(context);
      try {
        readApiKeyring(context.locals);
        return { ready: true as const };
      } catch (cause) {
        if (!isApiKeyringConfigurationError(cause)) throw cause;
        return { ready: false as const };
      }
    },
  }),

  list: defineAction({
    accept: "json",
    input: EmptyInputSchema,
    handler: async (_, context) => {
      const user = await requireAuth(context);
      const repository = await repositoryFor(context.locals);
      const credentials = hasEffectiveCapability(user, "manageApiTokens")
        ? await repository.listAllCredentials()
        : await repository.listPersonalCredentialsForPrincipal(user.id);
      return z.array(ApiCredentialPublicSchema).parse(credentials);
    },
  }),

  create: defineAction({
    accept: "json",
    input: CreateApiCredentialInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      const principalId = input.principalId ?? user.id;
      const privileged = hasEffectiveCapability(user, "manageApiTokens");
      if (input.kind === "service" || principalId !== user.id) {
        await requireCapability(context, "manageApiTokens");
      }
      const principalRecord = await (
        await getAuthAdapterAsync(context.locals)
      ).getUserById(principalId);
      if (!principalRecord) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "API credential principal not found",
        });
      }
      assertScopesAllowed(
        principalId === user.id
          ? user
          : SessionUserSchema.parse(principalRecord),
        input.scopes,
      );
      if (!privileged && input.kind !== "personal") {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Only API token managers can create service credentials",
        });
      }
      return createApiCredential({
        repository: await repositoryFor(context.locals),
        keyring: readApiKeyring(context.locals),
        actor: user,
        principalId,
        kind: input.kind,
        name: input.name,
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
      });
    },
  }),

  revoke: defineAction({
    accept: "json",
    input: RevokeInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      const repository = await repositoryFor(context.locals);
      const credential = await repository.getCredentialById(input.id);
      if (!credential) return { revoked: false };
      if (
        (credential.kind === "service" || credential.principalId !== user.id) &&
        !hasEffectiveCapability(user, "manageApiTokens")
      ) {
        await requireCapability(context, "manageApiTokens");
      }
      const revoked = await repository.revokeCredentialWithAudit({
        credential,
        actorId: user.id,
        requestId: crypto.randomUUID(),
      });
      return { revoked };
    },
  }),

  remove: defineAction({
    accept: "json",
    input: RemoveInputSchema,
    handler: async (input, context) => {
      const user = await requireAuth(context);
      const repository = await repositoryFor(context.locals);
      const credential = await repository.getCredentialById(input.id);
      if (!credential) return { removed: false };
      if (
        (credential.kind === "service" || credential.principalId !== user.id) &&
        !hasEffectiveCapability(user, "manageApiTokens")
      ) {
        await requireCapability(context, "manageApiTokens");
      }
      const removed = await repository.removeRevokedCredentialWithAudit({
        credential,
        actorId: user.id,
        requestId: crypto.randomUUID(),
      });
      return { removed };
    },
  }),
};
