import { z } from "zod";

import {
  ComponentDSLSchema,
  LayoutDSLSchema,
  PageDSLSchema,
} from "../../schemas/nodes";
import { CanonicalSha256Schema } from "./hash";

export const BrowserParityRuntimeSchema = z.enum(["node", "workerd"]);
export type BrowserParityRuntime = z.infer<typeof BrowserParityRuntimeSchema>;

export const BrowserParityViewportSchema = z
  .object({
    name: z.string().trim().min(1),
    width: z.int().min(320).max(7680),
    height: z.int().min(320).max(4320),
    deviceScaleFactor: z.literal(1),
  })
  .strict();
export type BrowserParityViewport = z.infer<
  typeof BrowserParityViewportSchema
>;

const BrowserParityFailureBaseSchema = z.object({
  id: z.string().trim().regex(/^PARITY-[A-Z0-9-]+$/u),
  assertion: z.enum([
    "authored-dom",
    "computed-style",
    "geometry",
    "native-state",
    "screenshot",
  ]),
});

export const BrowserParityExpectedFailureSchema = z.discriminatedUnion(
  "status",
  [
    BrowserParityFailureBaseSchema.extend({
      status: z.literal("active"),
      ownerPhase: z.int().min(3).max(11),
      reason: z.string().trim().min(1),
    }).strict(),
    BrowserParityFailureBaseSchema.extend({
      status: z.literal("resolved"),
      resolvedInPhase: z.int().min(2).max(11),
      evidence: z.string().trim().min(1),
    }).strict(),
  ],
);
export type BrowserParityExpectedFailure = z.infer<
  typeof BrowserParityExpectedFailureSchema
>;

export const BrowserParityRectSchema = z
  .object({
    left: z.number(),
    top: z.number(),
    width: z.number().min(0),
    height: z.number().min(0),
  })
  .strict();
export type BrowserParityRect = z.infer<typeof BrowserParityRectSchema>;

const CanvasAffordanceBaseSchema = z.object({
  nodeId: z.string().trim().min(1),
  position: BrowserParityRectSchema,
  presentation: z.enum(["box", "collapsed-rail"]),
  depth: z.number().int().nonnegative(),
});

export const CanvasAffordanceDescriptorSchema = z.discriminatedUnion("kind", [
  CanvasAffordanceBaseSchema.extend({
    kind: z.literal("empty-node"),
    nodeType: z.string().trim().min(1),
  }).strict(),
  CanvasAffordanceBaseSchema.extend({
    kind: z.literal("empty-component"),
    nodeType: z.string().trim().min(1),
  }).strict(),
  CanvasAffordanceBaseSchema.extend({
    kind: z.literal("missing-media"),
    nodeType: z.enum(["image", "video"]),
  }).strict(),
]);
export type CanvasAffordanceDescriptor = z.infer<
  typeof CanvasAffordanceDescriptorSchema
>;

export const EditorCaptureEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("pointer"),
      eventType: z.enum(["pointerdown", "click"]),
      target: z.enum([
        "inert",
        "link",
        "button",
        "form-control",
        "summary",
        "media",
      ]),
      metaKey: z.boolean(),
      ctrlKey: z.boolean(),
      shiftKey: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("form-lifecycle"),
      eventType: z.enum(["submit", "reset"]),
      target: z.literal("form"),
    })
    .strict(),
]);
export type EditorCaptureEvent = z.infer<typeof EditorCaptureEventSchema>;

const RuntimeHostDiagnosticSchema = z.discriminatedUnion("code", [
  z
    .object({
      code: z.literal("PARITY_HOST_START_FAILED"),
      message: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      code: z.literal("PARITY_HOST_NOT_READY"),
      message: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      code: z.literal("PARITY_HOST_RESPONSE_INVALID"),
      message: z.string().trim().min(1),
    })
    .strict(),
]);

export const BrowserParityRuntimeHostResultSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        status: z.literal("ready"),
        runtime: BrowserParityRuntimeSchema,
        origin: z.url(),
      })
      .strict(),
    z
      .object({
        status: z.literal("failed"),
        runtime: BrowserParityRuntimeSchema,
        diagnostic: RuntimeHostDiagnosticSchema,
      })
      .strict(),
  ],
);
export type BrowserParityRuntimeHostResult = z.infer<
  typeof BrowserParityRuntimeHostResultSchema
>;

export const BrowserParityFixtureSchema = z
  .object({
    contractVersion: z.literal(1),
    id: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    page: PageDSLSchema,
    layout: LayoutDSLSchema.nullable(),
    components: z.array(ComponentDSLSchema),
    viewports: z.array(BrowserParityViewportSchema).min(1),
    expectedFailures: z.array(BrowserParityExpectedFailureSchema),
  })
  .strict();
export type BrowserParityFixture = z.infer<
  typeof BrowserParityFixtureSchema
>;

export const BrowserParityNativeStateSchema = z
  .object({
    disabled: z.boolean().nullable(),
    checked: z.boolean().nullable(),
    selected: z.boolean().nullable(),
    open: z.boolean().nullable(),
    ariaExpanded: z.enum(["true", "false"]).nullable(),
  })
  .strict();
export type BrowserParityNativeState = z.infer<
  typeof BrowserParityNativeStateSchema
>;

export const BrowserParityNodeSnapshotSchema = z
  .object({
    parityId: z.string().trim().min(1),
    namespace: z.string().trim().min(1),
    tagName: z.string().trim().min(1),
    attributes: z.record(z.string(), z.string()),
    classes: z.array(z.string()),
    text: z.string(),
    computedStyles: z.record(z.string(), z.string()),
    rect: BrowserParityRectSchema,
    scrollWidth: z.int().nonnegative(),
    scrollHeight: z.int().nonnegative(),
    nativeState: BrowserParityNativeStateSchema,
  })
  .strict();
export type BrowserParityNodeSnapshot = z.infer<
  typeof BrowserParityNodeSnapshotSchema
>;

export const BrowserParitySurfaceSnapshotSchema = z
  .object({
    contractVersion: z.literal(1),
    runtime: BrowserParityRuntimeSchema,
    surface: z.enum(["public", "stage"]),
    fixtureId: z.string().trim().min(1),
    viewport: BrowserParityViewportSchema,
    authoredDom: z.string(),
    authoredDomHash: CanonicalSha256Schema,
    authoredInlineStyleHash: CanonicalSha256Schema,
    nodes: z.array(BrowserParityNodeSnapshotSchema),
  })
  .strict();
export type BrowserParitySurfaceSnapshot = z.infer<
  typeof BrowserParitySurfaceSnapshotSchema
>;

export const EditorDomExceptionRegistrySchema = z
  .object({
    unwrapAttributes: z.array(z.string().trim().min(1)),
    removeSubtreeAttributes: z.array(z.string().trim().min(1)),
    removeAttributes: z.array(z.string().trim().min(1)),
    removeClasses: z.array(z.string().trim().min(1)),
  })
  .strict();
export type EditorDomExceptionRegistry = z.infer<
  typeof EditorDomExceptionRegistrySchema
>;

export const PHASE_2_EDITOR_DOM_EXCEPTIONS =
  EditorDomExceptionRegistrySchema.parse({
    unwrapAttributes: ["data-aria-stage-content-root"],
    removeSubtreeAttributes: [
      "data-aria-stage-overlay-root",
      "data-aria-interaction-overlay",
    ],
    removeAttributes: [
      "data-aria-id",
      "data-aria-template-id",
      "data-aria-type",
      "data-component-ref",
      "data-drop-zone",
      "data-zone-id",
    ],
    removeClasses: ["aria-outline", "aria-wireframe"],
  });

export function parseBrowserParityFixture(
  input: unknown,
): BrowserParityFixture {
  return BrowserParityFixtureSchema.parse(input);
}

export function parseBrowserParitySurfaceSnapshot(
  input: unknown,
): BrowserParitySurfaceSnapshot {
  return BrowserParitySurfaceSnapshotSchema.parse(input);
}
