import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mergeSiteSettingsUpdate } from "../../../actions/settings";
import {
  hasEnabledInferenceProvider,
  mergeAgentSettings,
} from "../../../admin/features/Agent/lib/schemas";
import { buildInitialProviderInstance } from "../../../admin/features/Agent/lib/inferenceProviders";
import type { SiteSettings } from "../../../lib/storage/adapter";
import {
  createIsolatedSqliteStorage,
  type IsolatedSqliteStorage,
} from "../../helpers/isolatedSqliteStorage";

const OC_ID = "22222222-2222-4222-8222-222222222222";

describe("agent settings persistence", () => {
  let storage: IsolatedSqliteStorage;

  beforeAll(async () => {
    storage = await createIsolatedSqliteStorage();
  });

  afterAll(async () => {
    await storage.cleanup();
  });

  it("persists enabled toggle through site settings storage", async () => {
    const { adapter } = storage;
    const current = (await adapter.getSiteSettings()) ?? ({} as SiteSettings);

    const mergedAgent = mergeAgentSettings(current.agent, { enabled: true });
    const updated = mergeSiteSettingsUpdate(current, { agent: mergedAgent });

    expect(updated.agent?.enabled).toBe(true);

    await adapter.saveSiteSettings(updated);

    const reloaded = await adapter.getSiteSettings();
    expect(reloaded?.agent?.enabled).toBe(true);
  });

  it("persists ordered agent skills through site settings storage", async () => {
    const { adapter } = storage;
    const current = (await adapter.getSiteSettings()) ?? ({} as SiteSettings);
    const agent = mergeAgentSettings(current.agent, {
      skills: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Content strategist",
          instructions: "Favor short, practical blog content.",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Brand voice",
          instructions: "Write with a warm, direct voice.",
        },
      ],
    });

    await adapter.saveSiteSettings(mergeSiteSettingsUpdate(current, { agent }));

    const reloaded = await adapter.getSiteSettings();
    expect(reloaded?.agent?.skills).toEqual(agent.skills);
  });

  it("persists site instructions with agent skills", async () => {
    const { adapter } = storage;
    const current = (await adapter.getSiteSettings()) ?? ({} as SiteSettings);
    const agent = mergeAgentSettings(current.agent, {
      siteInstructions: "Prioritize portfolio work and concise answers.",
      skills: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Portfolio editor",
          instructions: "Lead case studies with measurable outcomes.",
        },
      ],
    });

    await adapter.saveSiteSettings(mergeSiteSettingsUpdate(current, { agent }));

    const reloaded = await adapter.getSiteSettings();
    expect(reloaded?.agent?.siteInstructions).toBe(
      "Prioritize portfolio work and concise answers.",
    );
    expect(reloaded?.agent?.skills).toEqual(agent.skills);
  });

  it("preserves enabled when a later patch only updates inference fields", async () => {
    const { adapter } = storage;
    const current = (await adapter.getSiteSettings()) ?? ({} as SiteSettings);

    const enabledAgent = mergeAgentSettings(current.agent, { enabled: true });
    await adapter.saveSiteSettings(
      mergeSiteSettingsUpdate(current, { agent: enabledAgent }),
    );

    const mid = (await adapter.getSiteSettings()) ?? ({} as SiteSettings);
    const inferencePatch = mergeAgentSettings(mid.agent, {
      inference: {
        default: {
          instanceId: OC_ID,
          modelId: "opencode/big-pickle",
        },
        providerInstances: {
          [OC_ID]: {
            id: OC_ID,
            backend: "opencode",
            label: "OpenCode",
            enabled: true,
            defaultModelId: "opencode/big-pickle",
            enabledModelIds: ["opencode/big-pickle"],
            opencodePlan: "zen",
          },
        },
      },
    });

    await adapter.saveSiteSettings(
      mergeSiteSettingsUpdate(mid, { agent: inferencePatch }),
    );

    const reloaded = await adapter.getSiteSettings();
    expect(reloaded?.agent?.enabled).toBe(true);
  });

  it("deactivate then reactivate preserves provider model configuration", () => {
    const customState = {
      id: OC_ID,
      backend: "opencode" as const,
      label: "OpenCode",
      enabled: true,
      defaultModelId: "opencode/gpt-5-nano",
      enabledModelIds: ["opencode/gpt-5-nano", "opencode/big-pickle"],
      opencodePlan: "go" as const,
    };

    const configured = mergeAgentSettings(undefined, {
      inference: {
        default: {
          instanceId: OC_ID,
          modelId: customState.defaultModelId,
        },
        providerInstances: {
          [OC_ID]: customState,
        },
      },
    });

    const deactivated = mergeAgentSettings(configured, {
      inference: {
        providerInstances: {
          [OC_ID]: { ...customState, enabled: false },
        },
      },
    });

    expect(deactivated.inference.providerInstances[OC_ID]?.enabled).toBe(false);
    expect(deactivated.inference.providerInstances[OC_ID]?.opencodePlan).toBe(
      "go",
    );

    const existing = deactivated.inference.providerInstances[OC_ID]!;
    const reactivated = mergeAgentSettings(deactivated, {
      inference: {
        providerInstances: {
          [OC_ID]: { ...existing, enabled: true },
        },
      },
    });

    expect(reactivated.inference.providerInstances[OC_ID]).toEqual(customState);
    expect(reactivated.inference.default).toEqual({
      instanceId: OC_ID,
      modelId: "opencode/gpt-5-nano",
    });
  });

  it("first-time provider activation seeds initial state", () => {
    const initial = buildInitialProviderInstance("opencode", "OpenCode");
    const activated = mergeAgentSettings(undefined, {
      inference: {
        providerInstances: {
          [initial.id]: initial,
        },
        default: {
          instanceId: initial.id,
          modelId: initial.defaultModelId ?? initial.enabledModelIds[0]!,
        },
      },
    });

    const instance = activated.inference.providerInstances[initial.id];
    expect(instance?.enabled).toBe(true);
    expect(instance?.opencodePlan).toBeUndefined();
    expect(instance?.enabledModelIds).toEqual(initial.enabledModelIds);
  });

  it("uses enabled providers, rather than the legacy enabled field, for activation", () => {
    const configured = mergeAgentSettings(undefined, {
      enabled: false,
      inference: {
        providerInstances: {
          [OC_ID]: {
            id: OC_ID,
            backend: "opencode",
            label: "OpenCode",
            enabled: true,
            enabledModelIds: ["opencode/big-pickle"],
            opencodePlan: "zen",
          },
        },
      },
    });

    expect(configured.enabled).toBe(false);
    expect(hasEnabledInferenceProvider(configured)).toBe(true);
  });
});
