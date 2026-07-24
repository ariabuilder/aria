import astroHandler from "@astrojs/cloudflare/entrypoints/server";
import {
  AriaStudioAgent,
  handleAgentRoutes,
} from "../admin/features/Agent/server";
import type { AriaCloudflareEnv } from "../lib/cloudflare/env";
import {
  handleEmailQueue,
  reconcileEmailDeliveries,
  type EmailMessageBatch,
} from "./email-delivery";
import { reconcileScheduledPublish } from "./scheduled-publish";
import { reconcileLocalizationInvalidations } from "./localization-invalidation";
import { reconcileWorkflowRetention } from "./workflow-retention";
import {
  handleThumbnailQueue,
  type ThumbnailMessageBatch,
} from "./thumbnail-generation";
import { AriaStudioLive } from "./studio-live";
import {
  handleIntegrationQueue,
  reconcileIntegrationDeliveries,
  type IntegrationMessageBatch,
} from "./integration-delivery";
import { reconcileOAuthMaintenance } from "./oauth-maintenance";
import { runScheduledTasks } from "./scheduled-tasks";

export { AriaStudioAgent, AriaStudioLive };

export default {
  async fetch(
    request: Request,
    env: AriaCloudflareEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const agentResponse = await handleAgentRoutes(request, env, ctx);
    if (agentResponse) {
      return agentResponse;
    }

    return astroHandler.fetch(request, env as never, ctx);
  },
  async queue(
    batch: EmailMessageBatch | ThumbnailMessageBatch | IntegrationMessageBatch,
    env: AriaCloudflareEnv,
  ): Promise<void> {
    if (batch.queue === "aria-thumbnail-generation") {
      await handleThumbnailQueue(batch as ThumbnailMessageBatch, env);
      return;
    }
    if (batch.queue?.startsWith("aria-integration-delivery")) {
      await handleIntegrationQueue(batch as IntegrationMessageBatch, env);
      return;
    }

    await handleEmailQueue(batch as EmailMessageBatch, env);
  },
  async scheduled(_event: unknown, env: AriaCloudflareEnv): Promise<void> {
    await runScheduledTasks([
      { name: "email", run: () => reconcileEmailDeliveries(env) },
      { name: "publishing", run: () => reconcileScheduledPublish(env) },
      {
        name: "localization",
        run: () => reconcileLocalizationInvalidations(env),
      },
      { name: "workflow-retention", run: () => reconcileWorkflowRetention(env) },
      { name: "integrations", run: () => reconcileIntegrationDeliveries(env) },
      { name: "oauth-maintenance", run: () => reconcileOAuthMaintenance(env) },
    ]);
  },
};
