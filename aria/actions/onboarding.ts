/**
 * Site-scoped first-run onboarding. The Studio owns the sequence; this action module persists
 * it and applies the current starter-content packs in small, retryable steps.
 */

import { ActionError, defineAction } from "astro:actions";
import { z } from "astro/zod";
import { getStorageAdapterAsync } from "../lib/storage/getStorageAdapter";
import { applyStarterDemoContentStep } from "../lib/storage/starterDemoContent";
import type { SiteSettings } from "../lib/storage/adapter";
import {
  requireAuth,
  resolveAuthorizedMutation,
} from "./_shared";

const FoundationSchema = z.enum(["blank", "starter-content"]);
const StepSchema = z.enum(["site-shell", "collections", "pages", "catalog"]);
// Keep the original identifiers readable in saved state so an interrupted
// onboarding session can resume after the renames. Only persist the current
// identifiers going forward.
const StoredStepSchema = z.union([
  StepSchema,
  z.enum(["editorial", "marketing"]),
]);
const OnboardingStateSchema = z.object({
  version: z.literal(1),
  status: z.enum(["unstarted", "named", "installing", "complete"]),
  foundation: FoundationSchema.optional(),
  completedSteps: z.array(StepSchema).default([]),
  completedAt: z.iso.datetime().optional(),
});
const StoredOnboardingStateSchema = OnboardingStateSchema.extend({
  completedSteps: z.array(StoredStepSchema).default([]),
});

type OnboardingState = z.infer<typeof OnboardingStateSchema>;

function readState(settings: SiteSettings | null): OnboardingState {
  const stored = StoredOnboardingStateSchema.parse(
    settings?.onboarding ?? {
      version: 1,
      status: "unstarted",
      completedSteps: [],
    },
  );

  return OnboardingStateSchema.parse({
    ...stored,
    completedSteps: stored.completedSteps.map((step) => {
      if (step === "editorial") return "collections";
      if (step === "marketing") return "pages";
      return step;
    }),
  });
}

async function persistState(
  context: Parameters<typeof resolveAuthorizedMutation>[0],
  settings: SiteSettings | null,
  state: OnboardingState,
): Promise<void> {
  const { authorship } = await resolveAuthorizedMutation(
    context,
    "settings.update",
    "save-site-settings",
  );
  const adapter = await getStorageAdapterAsync(context.locals);
  await adapter.saveSiteSettings(
    { ...(settings ?? {}), onboarding: state },
    authorship,
  );
}

export const onboarding = {
  getState: defineAction({
    accept: "json",
    handler: async (_, context) => {
      await requireAuth(context);
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      return {
        ...readState(settings),
        siteName: settings?.siteName ?? "",
      };
    },
  }),

  lockName: defineAction({
    accept: "json",
    input: z.object({ siteName: z.string().trim().min(1).max(120) }),
    handler: async ({ siteName }, context) => {
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      const next = OnboardingStateSchema.parse({
        ...readState(settings),
        status: "named",
      });

      await persistState(context, { ...(settings ?? {}), siteName }, next);
      return next;
    },
  }),

  startInstall: defineAction({
    accept: "json",
    input: z.object({ foundation: FoundationSchema }),
    handler: async ({ foundation }, context) => {
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      const current = readState(settings);
      if (current.status === "unstarted") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Name the site before launching its foundation.",
        });
      }

      const next = OnboardingStateSchema.parse({
        ...current,
        status: "installing",
        foundation,
        completedSteps: [],
      });
      await persistState(context, settings, next);
      return next;
    },
  }),

  installStep: defineAction({
    accept: "json",
    input: z.object({ stepId: StepSchema }),
    handler: async ({ stepId }, context) => {
      const { authorship } = await resolveAuthorizedMutation(
        context,
        "settings.update",
        "save-site-settings",
      );
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      const current = readState(settings);
      if (current.status !== "installing" || !current.foundation) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Foundation installation has not started.",
        });
      }

      if (!current.completedSteps.includes(stepId)) {
        await applyStarterDemoContentStep(adapter, stepId, authorship.actor);
        current.completedSteps.push(stepId);
      }

      const next = OnboardingStateSchema.parse(current);
      const latestSettings = await adapter.getSiteSettings();
      await adapter.saveSiteSettings(
        { ...(latestSettings ?? {}), onboarding: next },
        authorship,
      );
      return next;
    },
  }),

  complete: defineAction({
    accept: "json",
    handler: async (_, context) => {
      const adapter = await getStorageAdapterAsync(context.locals);
      const settings = await adapter.getSiteSettings();
      const current = readState(settings);
      if (current.status !== "installing") {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Foundation installation has not started.",
        });
      }

      const next = OnboardingStateSchema.parse({
        ...current,
        status: "complete",
        completedAt: new Date().toISOString(),
      });
      await persistState(context, settings, next);
      return next;
    },
  }),
};
