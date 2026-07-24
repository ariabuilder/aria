import { describe, expect, it } from "vitest";
import {
  NormalizedInferenceUsageSchema,
  SaveAiQuotaPolicyInputSchema,
  StartInferenceRunInputSchema,
} from "../../../admin/features/Agent/lib/usage/schemas";
import { normalizeAiSdkUsage } from "../../../admin/features/Agent/lib/usage/service";

describe("AI usage schemas", () => {
  it("represents BYOK independently from Cloudflare routing", () => {
    expect(
      StartInferenceRunInputSchema.parse({
        requestId: "request-1",
        turnId: "turn-1",
        siteId: "example.com",
        userId: "user-1",
        providerInstanceId: crypto.randomUUID(),
        backend: "openrouter",
        modelId: "openai/gpt-5-mini",
        billingMode: "tenant_byok",
        routeType: "direct",
        transport: "studio_http",
        feature: "studio_agent",
      }),
    ).toMatchObject({ billingMode: "tenant_byok", routeType: "direct" });
  });

  it("keeps missing provider usage unknown instead of zero", () => {
    expect(normalizeAiSdkUsage({})).toEqual(
      NormalizedInferenceUsageSchema.parse({
        inputTokens: null,
        outputTokens: null,
      }),
    );
  });

  it("requires user subjects and safe warning thresholds", () => {
    expect(
      SaveAiQuotaPolicyInputSchema.safeParse({
        subjectType: "user",
        subjectId: null,
        metric: "requests",
        windowSeconds: 3600,
        warningLimit: 10,
        hardLimit: 10,
        reservationUnits: 1,
        billingModes: ["tenant_byok"],
        enabled: true,
      }).success,
    ).toBe(false);
  });
});
