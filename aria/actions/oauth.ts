import { defineAction } from "astro:actions";
import { z } from "zod";

import { getApiSqlDatabase } from "../lib/api/database";
import { ApiRepository } from "../lib/api/repository";
import { requireCapability } from "../lib/auth";
import { readOAuthConfiguration } from "../lib/oauth/config";
import { OAuthRepository } from "../lib/oauth/repository";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";

const EmptySchema = z.object({}).strict();
const RevokeGrantSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().min(1).max(250).default("Revoked in Studio"),
  })
  .strict();

async function repositories(locals: App.Locals) {
  const storage = await getStorageAdapterAsync(locals);
  await storage.getSiteSettings();
  const database = await getApiSqlDatabase(locals);
  return {
    api: new ApiRepository(database),
    oauth: new OAuthRepository(database),
  };
}

export const oauth = {
  status: defineAction({
    accept: "json",
    input: EmptySchema,
    handler: async (_, context) => {
      await requireCapability(context, "manageIntegrations");
      try {
        const configuration = readOAuthConfiguration(context.locals);
        return {
          enabled: true,
          canonicalOrigin: configuration.canonicalOrigin,
        };
      } catch {
        return { enabled: false, canonicalOrigin: null };
      }
    },
  }),

  listGrants: defineAction({
    accept: "json",
    input: EmptySchema,
    handler: async (_, context) => {
      await requireCapability(context, "manageIntegrations");
      const repository = await repositories(context.locals);
      const siteId = await repository.api.getOrCreateSiteIdentity();
      await repository.oauth.ensureBuiltInFigmaClient(siteId);
      return repository.oauth.listGrantSummaries(siteId);
    },
  }),

  revokeGrant: defineAction({
    accept: "json",
    input: RevokeGrantSchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      const repository = await repositories(context.locals);
      return {
        revoked: await repository.oauth.revokeGrant({
          grantId: input.id,
          siteId: await repository.api.getOrCreateSiteIdentity(),
          actorId: user.id,
          reason: input.reason,
        }),
      };
    },
  }),
};
