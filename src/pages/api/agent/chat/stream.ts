import type { APIRoute, APIContext } from "astro";
import type { ModelMessage } from "ai";
import { getAuthAdapterAsync, requireAuth } from "../../../../../aria/lib/auth";
import { hasEffectiveCapability } from "../../../../../aria/lib/auth";
import { getStorageAdapterAsync } from "../../../../../aria/lib/storage/getStorageAdapter";
import { isFeatureEnabled } from "../../../../../aria/lib/features";
import type { RuntimeLocals } from "../../../../../aria/lib/cloudflare/env";
import { mergeAgentSettings } from "../../../../../aria/lib/agent/settings";
import { resolveAgentAvailability } from "../../../../../aria/admin/features/Agent/lib/availability";
import { AgentChatInputSchema } from "../../../../../aria/lib/agent/chat";
import {
  resolveRequestInference,
  canUseChatInference,
  assertModelAllowed,
} from "../../../../../aria/admin/features/Agent/lib/inferenceSelection";
import { getProviderState } from "../../../../../aria/admin/features/Agent/lib/inference/inferenceHelpers";
import { resolveRuntimePlatform } from "../../../../../aria/admin/features/Agent/lib/platform";
import { formatInferenceError } from "../../../../../aria/admin/features/Agent/lib/inference/inferenceErrors";
import { listConfiguredBackends } from "../../../../../aria/admin/features/Agent/lib/inference/byokStore";
import {
  hasAgentDurableObjectBinding,
  hasWorkersAiBinding,
} from "../../../../../aria/admin/features/Agent/lib/inference/runtimeEnv";
import type { ResolvedModel } from "../../../../../aria/admin/features/Agent/server/inference/types";

export const POST: APIRoute = async (ctx: APIContext) => {
  const { request, locals } = ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const inputResult = AgentChatInputSchema.safeParse(body);
  if (!inputResult.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid input",
        issues: inputResult.error.issues,
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  const input = inputResult.data;

  // Cast to the context shape that requireAuth expects.
  // Both APIContext and ActionAPIContext share locals/request/cookies.
  const actionCtx = ctx as Parameters<typeof requireAuth>[0];
  let user: Awaited<ReturnType<typeof requireAuth>>;

  try {
    user = await requireAuth(actionCtx);
  } catch {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  if (!hasEffectiveCapability(user, "useStudioAgent")) {
    return new Response(JSON.stringify({ error: "Agent is not available" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const adapter = await getStorageAdapterAsync(locals);
  const authAdapter = await getAuthAdapterAsync(locals);
  const siteSettings = await adapter.getSiteSettings();
  const platform = await resolveRuntimePlatform(locals);
  const runtimeLocals = locals as RuntimeLocals;
  const workersAiBindingPresent = hasWorkersAiBinding(runtimeLocals);
  const durableAgentBindingPresent =
    hasAgentDurableObjectBinding(runtimeLocals);

  const availability = resolveAgentAvailability({
    platform,
    featureEnabled: isFeatureEnabled("studio.agent"),
    user,
    siteSettings,
    workersAiBindingPresent,
    configuredBackends: await listConfiguredBackends(authAdapter),
    durableAgentAvailable:
      platform === "cloudflare" && durableAgentBindingPresent,
  });

  if (!availability.canUseStudioAgent) {
    return new Response(JSON.stringify({ error: "Agent is not available" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (availability.effectiveInferenceBackend === "unavailable") {
    return new Response(
      JSON.stringify({ error: "Inference is not configured" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const agentSettings = mergeAgentSettings(siteSettings?.agent, {});

  const resolved = resolveRequestInference({
    settings: agentSettings,
    platform,
    workersAiAvailable: availability.workersAiAvailable,
    configuredBackends: availability.configuredBackends,
    sessionOverride: input.sessionModel,
  });

  if (
    !resolved ||
    !canUseChatInference({
      settings: agentSettings,
      platform,
      workersAiAvailable: availability.workersAiAvailable,
      configuredBackends: availability.configuredBackends,
    })
  ) {
    return new Response(
      JSON.stringify({ error: "Selected inference is not configured" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  assertModelAllowed(agentSettings, resolved.provider, resolved.modelId);

  const providerState = getProviderState(agentSettings, resolved.provider);

  const resolvedModel: ResolvedModel = {
    instanceId: resolved.instanceId,
    provider: resolved.provider,
    modelId: resolved.modelId,
    billingMode:
      resolved.provider === "workers_ai"
        ? "deployment_binding"
        : "tenant_byok",
    route: providerState?.route ?? { type: "direct" },
    openaiCompatibleBaseUrl: providerState?.baseUrl,
  };

  const toolCallIdToToolName = new Map<string, string>();
  for (const m of input.messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const tc of m.toolCalls) {
        toolCallIdToToolName.set(tc.id, tc.toolName);
      }
    }
  }

  const convertedMessages: ModelMessage[] = input.messages.flatMap(
    (message): ModelMessage[] => {
      if (message.role === "tool") {
        const toolCallId = message.toolCallId ?? "";
        const toolName = toolCallIdToToolName.get(toolCallId) ?? "unknown";

        let parsed: unknown;
        try {
          parsed = JSON.parse(message.content);
        } catch {
          parsed = message.content;
        }

        const output =
          typeof parsed === "string"
            ? ({ type: "text" as const, value: parsed } as const)
            : ({ type: "json" as const, value: parsed } as const);

        return [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId,
                toolName,
                output,
              },
            ],
          } as ModelMessage,
        ];
      }
      if (message.role === "assistant" && message.toolCalls?.length) {
        const parts: Array<
          | { type: "text"; text: string }
          | { type: "reasoning"; text: string }
          | {
              type: "tool-call";
              toolCallId: string;
              toolName: string;
              input: unknown;
            }
        > = [];
        if (message.reasoning) {
          parts.push({ type: "reasoning", text: message.reasoning });
        }
        if (message.content) {
          parts.push({ type: "text", text: message.content });
        }
        for (const tc of message.toolCalls) {
          parts.push({
            type: "tool-call",
            toolCallId: tc.id,
            toolName: tc.toolName,
            input: tc.input,
          });
        }
        return [
          {
            role: "assistant",
            content: parts,
          } as ModelMessage,
        ];
      }
      if (message.reasoning) {
        return [
          {
            role: "assistant",
            content: [
              { type: "reasoning", text: message.reasoning },
              ...(message.content
                ? [{ type: "text" as const, text: message.content }]
                : []),
            ],
          } as ModelMessage,
        ];
      }
      return [
        {
          role: message.role as "user" | "assistant",
          content: message.content,
        },
      ];
    },
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { runAgentChatWithToolsStreaming } = await import(
          "../../../../../aria/admin/features/Agent/lib/chatToolLoop"
        );
        const gen = runAgentChatWithToolsStreaming({
          requestId: crypto.randomUUID(),
          turnId: input.messages.at(-1)?.id ?? crypto.randomUUID(),
          siteId: new URL(request.url).hostname,
          platform,
          resolved: resolvedModel,
          deps: {
            locals: runtimeLocals,
            authAdapter,
          },
          settings: agentSettings,
          composerMode: input.composerMode,
          messages: convertedMessages,
          actionContext: {
            locals,
            request,
            user,
          },
          shellContext: input.shellContext,
          transport: "studio_http",
          seoContext: input.seoContext,
          abortSignal: request.signal,
        });

        for await (const event of gen) {
          if (event.type === "finished") break;
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        const message = formatInferenceError(error);
        try {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "error" as const, error: message }) + "\n",
            ),
          );
        } catch {
          // Controller may already be closed — ignore
        }
      } finally {
        try {
          controller.close();
        } catch {
          // May already be closed or errored
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
};
