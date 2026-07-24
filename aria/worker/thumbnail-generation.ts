import type { AriaCloudflareEnv, RuntimeLocals } from "../lib/cloudflare/env";
import {
  generatePageThumbnailOnServer,
  PageThumbnailJobMessageSchema,
} from "../lib/rendering/pageThumbnailServer";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";

type QueueMessage<Body> = {
  body: Body;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type ThumbnailMessageBatch = {
  queue?: string;
  messages: readonly QueueMessage<unknown>[];
};

function locals(env: AriaCloudflareEnv): RuntimeLocals {
  return { cfBindings: env };
}

export async function handleThumbnailQueue(
  batch: ThumbnailMessageBatch,
  env: AriaCloudflareEnv,
): Promise<void> {
  const adapter = await getStorageAdapterAsync(locals(env));

  for (const message of batch.messages) {
    const parsed = PageThumbnailJobMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      console.error(
        JSON.stringify({
          event: "thumbnail.queue.invalid",
          issues: parsed.error.issues,
        }),
      );
      message.ack();
      continue;
    }

    const result = await generatePageThumbnailOnServer({
      adapter,
      env,
      pageId: parsed.data.pageId,
      pageSlug: parsed.data.pageSlug,
      stage: parsed.data.stage,
    });

    if (result.success) {
      console.info(
        JSON.stringify({
          event: "thumbnail.queue.generated",
          pageId: parsed.data.pageId,
          stage: parsed.data.stage,
          thumbnailUrl: result.thumbnailUrl,
        }),
      );
      message.ack();
      continue;
    }

    console.error(
      JSON.stringify({
        event: "thumbnail.queue.failed",
        pageId: parsed.data.pageId,
        stage: parsed.data.stage,
        error: result.error,
      }),
    );
    message.retry({ delaySeconds: 30 });
  }
}
