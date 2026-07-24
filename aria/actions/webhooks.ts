import { defineAction } from "astro:actions";
import { z } from "zod";

import { requireCapability } from "../lib/auth";
import { readApiKeyring } from "../lib/api/crypto";
import { getApiSqlDatabase } from "../lib/api/database";
import { ApiRepository } from "../lib/api/repository";
import {
  normalizeWebhookUrl,
  readWebhookEgressPolicy,
} from "../lib/integrations/webhooks/egress";
import {
  CreateWebhookEndpointSchema,
  EnabledWebhookEventTypes,
  UpdateWebhookSubscriptionsSchema,
  WebhookRepository,
} from "../lib/integrations/webhooks/repository";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import {
  getWebhookDeliveryOverview,
  listRecentWebhookDeliveries,
  retryTerminalWebhookDelivery,
} from "../lib/integrations/webhooks/maintenance";
import {
  getCloudflareEnv,
  getStringRuntimeSetting,
} from "../lib/cloudflare/env";
import { isNodeIntegrationWorkerReady } from "../lib/integrations/nodeWorker";

const EmptySchema = z.object({}).strict();
const RotateSchema = z.object({ id: z.uuid() }).strict();
const StatusSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(["active", "paused", "disabled"]),
    reason: z.string().trim().min(1).max(250).nullable().optional(),
  })
  .strict();
const RetrySchema = z
  .object({ id: z.uuid(), reason: z.string().trim().min(1).max(250) })
  .strict();
const ListDeliveriesSchema = z
  .object({ limit: z.number().int().min(1).max(100).default(30) })
  .strict();

async function repositories(locals: App.Locals) {
  const storage = await getStorageAdapterAsync(locals);
  await storage.getSiteSettings();
  const database = await getApiSqlDatabase(locals);
  return {
    database,
    api: new ApiRepository(database),
    webhooks: new WebhookRepository(database),
  };
}

export const webhooks = {
  status: defineAction({
    accept: "json",
    input: EmptySchema,
    handler: async (_, context) => {
      await requireCapability(context, "manageIntegrations");
      let keyringReady = true;
      let egressReady = true;
      let egressMode: "allowlist" | "proxy" | "loopback-development" | null =
        null;
      try {
        readApiKeyring(context.locals);
      } catch {
        keyringReady = false;
      }
      try {
        egressMode = readWebhookEgressPolicy(context.locals).mode;
      } catch {
        egressReady = false;
      }
      const runtime =
        getStringRuntimeSetting("ARIA_RUNTIME", context.locals) === "node"
          ? "node"
          : "cloudflare";
      const queueReady =
        runtime === "cloudflare"
          ? Boolean(getCloudflareEnv(context.locals).aria_integration_queue)
          : null;
      let workerReady: boolean | null = null;
      if (runtime === "node") {
        try {
          workerReady = await isNodeIntegrationWorkerReady(
            await getApiSqlDatabase(context.locals),
          );
        } catch {
          workerReady = false;
        }
      }
      return {
        ready:
          keyringReady &&
          egressReady &&
          (runtime === "cloudflare"
            ? queueReady === true
            : workerReady === true),
        keyringReady,
        egressReady,
        egressMode,
        queueReady,
        workerReady,
        runtime,
        eventTypes: EnabledWebhookEventTypes,
      };
    },
  }),

  list: defineAction({
    accept: "json",
    input: EmptySchema,
    handler: async (_, context) => {
      await requireCapability(context, "manageIntegrations");
      return (await repositories(context.locals)).webhooks.listEndpoints();
    },
  }),

  create: defineAction({
    accept: "json",
    input: CreateWebhookEndpointSchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      const policy = readWebhookEgressPolicy(context.locals);
      const normalizedUrl = normalizeWebhookUrl(input.url, policy);
      const repository = await repositories(context.locals);
      return repository.webhooks.createEndpoint({
        siteId: await repository.api.getOrCreateSiteIdentity(),
        actorId: user.id,
        name: input.name,
        normalizedUrl,
        payloadMode: input.payloadMode,
        eventTypes: input.eventTypes,
        keyring: readApiKeyring(context.locals),
      });
    },
  }),

  rotateSecret: defineAction({
    accept: "json",
    input: RotateSchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      return (await repositories(context.locals)).webhooks.rotateSigningKey({
        endpointId: input.id,
        actorId: user.id,
        keyring: readApiKeyring(context.locals),
      });
    },
  }),

  updateSubscriptions: defineAction({
    accept: "json",
    input: UpdateWebhookSubscriptionsSchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      return {
        updated: await (
          await repositories(context.locals)
        ).webhooks.updateSubscriptions({
          endpointId: input.id,
          actorId: user.id,
          eventTypes: input.eventTypes,
        }),
      };
    },
  }),

  setStatus: defineAction({
    accept: "json",
    input: StatusSchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      const repository = await repositories(context.locals);
      if (input.status === "active") {
        const url = await repository.webhooks.getEndpointUrl(input.id);
        if (url) {
          normalizeWebhookUrl(url, readWebhookEgressPolicy(context.locals));
        }
      }
      return {
        updated: await repository.webhooks.setEndpointStatus({
          endpointId: input.id,
          actorId: user.id,
          status: input.status,
          reason: input.reason,
        }),
      };
    },
  }),

  deliveryOverview: defineAction({
    accept: "json",
    input: EmptySchema,
    handler: async (_, context) => {
      await requireCapability(context, "manageIntegrations");
      return getWebhookDeliveryOverview(
        (await repositories(context.locals)).database,
      );
    },
  }),

  listDeliveries: defineAction({
    accept: "json",
    input: ListDeliveriesSchema,
    handler: async (input, context) => {
      await requireCapability(context, "manageIntegrations");
      return listRecentWebhookDeliveries(
        (await repositories(context.locals)).database,
        input.limit,
      );
    },
  }),

  retryDelivery: defineAction({
    accept: "json",
    input: RetrySchema,
    handler: async (input, context) => {
      const user = await requireCapability(context, "manageIntegrations");
      return {
        retried: await retryTerminalWebhookDelivery({
          database: (await repositories(context.locals)).database,
          deliveryId: input.id,
          actorId: user.id,
          reason: input.reason,
        }),
      };
    },
  }),
};
