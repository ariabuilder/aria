import { z } from "astro/zod";
import type { StorageAdapter } from "../../storage/adapter";
import {
  ContentSyncConflictPolicySchema,
  ContentSyncEndpointIdSchema,
  ContentSyncPlanInputSchema,
  ContentSyncPlanItemSchema,
  ContentSyncPlanSchema,
  ContentSyncResourceStateSchema,
  ContentSyncResourceTypeSchema,
  summarizeContentSyncPlanItems,
  toContentSyncRevisionSnapshot,
  type ContentSyncEndpointId,
  type ContentSyncPlan,
  type ContentSyncPlanInput,
  type ContentSyncPlanItem,
  type ContentSyncResourceState,
  type ContentSyncResourceType,
} from "../schema";
import type {
  CreateContentSyncDryRunJobInput,
  PersistedContentSyncItemInput,
} from "./repository";

export const DEFAULT_CONTENT_SYNC_RESOURCE_TYPES = [
  "page",
  "page-locale",
  "layout",
  "layout-locale",
  "component",
  "styles",
  "site-settings",
  "cms-collection",
  "cms-entry",
] as const satisfies readonly ContentSyncResourceType[];

export const ContentSyncPlannerRequestSchema =
  ContentSyncPlanInputSchema.extend({
    localEndpointId: ContentSyncEndpointIdSchema.default("local-sqlite"),
    remoteEndpointId: ContentSyncEndpointIdSchema.default("cloudflare-d1"),
    resourceTypes: z
      .array(ContentSyncResourceTypeSchema)
      .min(1)
      .default([...DEFAULT_CONTENT_SYNC_RESOURCE_TYPES]),
  }).superRefine((value, context) => {
    if (value.resourceTypes.includes("snapshot")) {
      context.addIssue({
        code: "custom",
        message:
          "Snapshot sync is no longer supported in the runtime delivery path",
        path: ["resourceTypes"],
      });
    }
  });
export type ContentSyncPlannerRequest = z.infer<
  typeof ContentSyncPlannerRequestSchema
>;

export const ContentSyncPlannerEndpointSchema = z.object({
  id: ContentSyncEndpointIdSchema,
  role: z.enum(["local", "remote", "source", "target"]),
});
export type ContentSyncPlannerEndpoint = z.infer<
  typeof ContentSyncPlannerEndpointSchema
>;

export const ContentSyncPlannerResourcePairSchema = z.object({
  resourceType: ContentSyncResourceTypeSchema,
  resourceId: z.string().min(1),
  resourceLabel: z.string().min(1).optional(),
  local: ContentSyncResourceStateSchema.nullable(),
  remote: ContentSyncResourceStateSchema.nullable(),
});
export type ContentSyncPlannerResourcePair = z.infer<
  typeof ContentSyncPlannerResourcePairSchema
>;

export interface ContentSyncPlannerInput {
  request: ContentSyncPlannerRequest | ContentSyncPlanInput;
  localAdapter: StorageAdapter;
  remoteAdapter: StorageAdapter;
  actorId?: string;
  createdAt?: string;
  notes?: string;
  jobIdFactory?: () => string;
  itemIdFactory?: () => string;
}

export interface ContentSyncPlannerCollectPairsInput {
  request: ContentSyncPlannerRequest;
  localEndpoint: ContentSyncPlannerEndpoint;
  remoteEndpoint: ContentSyncPlannerEndpoint;
  sourceEndpoint: ContentSyncPlannerEndpoint;
  targetEndpoint: ContentSyncPlannerEndpoint;
  localAdapter: StorageAdapter;
  remoteAdapter: StorageAdapter;
}

export interface ContentSyncPlannerComparePairInput {
  request: ContentSyncPlannerRequest;
  pair: ContentSyncPlannerResourcePair;
  localEndpoint: ContentSyncPlannerEndpoint;
  remoteEndpoint: ContentSyncPlannerEndpoint;
  sourceEndpoint: ContentSyncPlannerEndpoint;
  targetEndpoint: ContentSyncPlannerEndpoint;
}

export interface ContentSyncPlannerResult {
  job: CreateContentSyncDryRunJobInput;
  plan: ContentSyncPlan;
}

function toPersistedContentSyncItem(
  item: ContentSyncPlanItem,
  itemIdFactory: () => string,
): PersistedContentSyncItemInput {
  return {
    id: itemIdFactory(),
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    resourceLabel: item.resourceLabel,
    action: item.action,
    localVersion: item.localVersion,
    remoteVersion: item.remoteVersion,
    localChecksum: item.localChecksum,
    remoteChecksum: item.remoteChecksum,
    resultStatus: "planned",
    conflictReason: item.action === "conflict" ? item.reason : undefined,
  };
}

function resolveEndpointPair(request: ContentSyncPlannerRequest): Pick<
  CreateContentSyncDryRunJobInput,
  "direction" | "sourceEndpointId" | "targetEndpointId" | "conflictPolicy"
> & {
  localEndpointId: ContentSyncEndpointId;
  remoteEndpointId: ContentSyncEndpointId;
} {
  const localEndpointId = request.localEndpointId;
  const remoteEndpointId = request.remoteEndpointId;

  const sourceEndpointId =
    request.sourceEndpointId ??
    (request.direction === "push" ? localEndpointId : remoteEndpointId);
  const targetEndpointId =
    request.targetEndpointId ??
    (request.direction === "push" ? remoteEndpointId : localEndpointId);

  return {
    direction: request.direction,
    sourceEndpointId: ContentSyncEndpointIdSchema.parse(sourceEndpointId),
    targetEndpointId: ContentSyncEndpointIdSchema.parse(targetEndpointId),
    conflictPolicy: ContentSyncConflictPolicySchema.parse(
      request.conflictPolicy,
    ),
    localEndpointId,
    remoteEndpointId,
  };
}

export abstract class ContentSyncPlanner {
  async plan(
    input: ContentSyncPlannerInput,
  ): Promise<ContentSyncPlannerResult> {
    const request = ContentSyncPlannerRequestSchema.parse(input.request);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const endpointPair = resolveEndpointPair(request);

    const localEndpoint = ContentSyncPlannerEndpointSchema.parse({
      id: endpointPair.localEndpointId,
      role: "local",
    });
    const remoteEndpoint = ContentSyncPlannerEndpointSchema.parse({
      id: endpointPair.remoteEndpointId,
      role: "remote",
    });
    const sourceEndpoint = ContentSyncPlannerEndpointSchema.parse({
      id: endpointPair.sourceEndpointId,
      role: "source",
    });
    const targetEndpoint = ContentSyncPlannerEndpointSchema.parse({
      id: endpointPair.targetEndpointId,
      role: "target",
    });

    const [localState, remoteState, pairs] = await Promise.all([
      input.localAdapter.getContentSiteState(),
      input.remoteAdapter.getContentSiteState(),
      this.collectResourcePairs({
        request,
        localEndpoint,
        remoteEndpoint,
        sourceEndpoint,
        targetEndpoint,
        localAdapter: input.localAdapter,
        remoteAdapter: input.remoteAdapter,
      }),
    ]);

    const items = pairs.map((pair) =>
      ContentSyncPlanItemSchema.parse(
        this.comparePair({
          request,
          pair: ContentSyncPlannerResourcePairSchema.parse(pair),
          localEndpoint,
          remoteEndpoint,
          sourceEndpoint,
          targetEndpoint,
        }),
      ),
    );

    const plan = ContentSyncPlanSchema.parse({
      direction: endpointPair.direction,
      mode: "dry-run",
      sourceEndpointId: endpointPair.sourceEndpointId,
      targetEndpointId: endpointPair.targetEndpointId,
      conflictPolicy: endpointPair.conflictPolicy,
      localRevision: toContentSyncRevisionSnapshot(localState),
      remoteRevision: toContentSyncRevisionSnapshot(remoteState),
      items,
      summary: summarizeContentSyncPlanItems(items),
      generatedAt: createdAt,
    });

    return {
      job: this.buildDryRunJobInput({
        request,
        plan,
        actorId: input.actorId,
        createdAt,
        notes: input.notes,
        jobIdFactory: input.jobIdFactory,
        itemIdFactory: input.itemIdFactory,
      }),
      plan,
    };
  }

  protected abstract collectResourcePairs(
    input: ContentSyncPlannerCollectPairsInput,
  ): Promise<readonly ContentSyncPlannerResourcePair[]>;

  protected abstract comparePair(
    input: ContentSyncPlannerComparePairInput,
  ): ContentSyncPlanItem;

  protected buildDryRunJobInput(input: {
    request: ContentSyncPlannerRequest;
    plan: ContentSyncPlan;
    actorId?: string;
    createdAt: string;
    notes?: string;
    jobIdFactory?: () => string;
    itemIdFactory?: () => string;
  }): CreateContentSyncDryRunJobInput {
    const jobIdFactory = input.jobIdFactory ?? (() => crypto.randomUUID());
    const itemIdFactory = input.itemIdFactory ?? (() => crypto.randomUUID());

    return {
      id: jobIdFactory(),
      direction: input.plan.direction,
      sourceEndpointId: input.plan.sourceEndpointId,
      targetEndpointId: input.plan.targetEndpointId,
      conflictPolicy: input.plan.conflictPolicy,
      localRevisionId: input.plan.localRevision?.revisionId,
      remoteRevisionId: input.plan.remoteRevision?.revisionId,
      summary: input.plan.summary,
      createdBy: input.actorId,
      createdAt: input.createdAt,
      startedAt: input.createdAt,
      finishedAt: input.createdAt,
      notes: input.notes,
      items: input.plan.items.map((item) =>
        toPersistedContentSyncItem(item, itemIdFactory),
      ),
    };
  }

  protected filterResourcePairs(
    pairs: readonly ContentSyncPlannerResourcePair[],
    resourceTypes: readonly ContentSyncResourceType[],
  ): ContentSyncPlannerResourcePair[] {
    const allowedTypes = new Set(resourceTypes);

    return pairs.filter((pair) => allowedTypes.has(pair.resourceType));
  }

  protected createResourcePair(input: {
    resourceType: ContentSyncResourceType;
    resourceId: string;
    resourceLabel?: string;
    local: ContentSyncResourceState | null;
    remote: ContentSyncResourceState | null;
  }): ContentSyncPlannerResourcePair {
    return ContentSyncPlannerResourcePairSchema.parse(input);
  }

  protected createPlanItem(input: ContentSyncPlanItem): ContentSyncPlanItem {
    return ContentSyncPlanItemSchema.parse(input);
  }
}
