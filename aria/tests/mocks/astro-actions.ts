import { createDefaultUniversalBreakpointItems } from "../../lib/styles/universalDesignSystem";

/**
 * Astro 7-shaped defineAction mock: callable with `.orThrow` and legacy
 * `.handler` so agent tool callers exercise the production call path.
 */
export function defineAction<T extends { handler?: (...args: never[]) => unknown }>(
  config: T,
): T & {
  (this: unknown, input: unknown): Promise<unknown>;
  orThrow: (this: unknown, input: unknown) => Promise<unknown>;
  handler: NonNullable<T["handler"]>;
} {
  const handler = config.handler as
    | ((input: unknown, context: unknown) => Promise<unknown>)
    | undefined;

  async function actionFn(this: unknown, input: unknown): Promise<unknown> {
    if (!handler) {
      throw new Error("Mock action missing handler");
    }
    return handler(input, this);
  }

  return Object.assign(actionFn, config, {
    handler,
    orThrow(this: unknown, input: unknown) {
      if (!handler) {
        throw new Error("Mock action missing handler");
      }
      return handler(input, this);
    },
  }) as T & {
    (this: unknown, input: unknown): Promise<unknown>;
    orThrow: (this: unknown, input: unknown) => Promise<unknown>;
    handler: NonNullable<T["handler"]>;
  };
}

export class ActionError extends Error {
  code: string;

  constructor(input: { code: string; message: string }) {
    super(input.message);
    this.code = input.code;
    this.name = "ActionError";
  }
}

const defaultBreakpoints = createDefaultUniversalBreakpointItems();

const defaultActionResult = { data: { success: true }, error: null };

export const actions = {
  library: {
    catalog: async () => ({ data: null, error: null }),
    listInstalled: async () => ({ data: null, error: null }),
    installPack: async () => ({ data: null, error: null }),
    uninstallPack: async () => ({ data: null, error: null }),
    checkUpdates: async () => ({ data: null, error: null }),
  },
  designSystem: {
    getBreakpoints: async () => ({
      data: {
        success: true,
        data: { breakpoints: defaultBreakpoints },
      },
      error: null,
    }),
    saveBreakpoints: async () => defaultActionResult,
    getColors: async () => ({
      data: {
        success: true,
        data: {
          colors: {
            activeTemplateId: "custom",
            palettes: {},
            semantic: {
              success: "#22c55e",
              warning: "#f59e0b",
              error: "#ef4444",
              info: "#3b82f6",
            },
          },
        },
      },
      error: null,
    }),
    saveColors: async () => defaultActionResult,
    getTypography: async () => ({ data: { success: true, data: {} }, error: null }),
    saveTypography: async () => defaultActionResult,
    getGlobalStyles: async () => ({
      data: {
        success: true,
        data: { globalStyles: { variables: { custom: {}, aliases: {} } } },
      },
      error: null,
    }),
    saveGlobalStyles: async () => defaultActionResult,
    getVariableManagerBootstrap: async () => ({
      data: { success: true, data: {} },
      error: null,
    }),
    applyTemplate: async () => defaultActionResult,
    listTemplates: async () => ({ data: { success: true, data: { templates: [] } }, error: null }),
    import: async () => defaultActionResult,
    export: async () => defaultActionResult,
    importBundle: async () => defaultActionResult,
  },
  settings: {
    get: async () => ({ data: { success: true, data: {} }, error: null }),
    update: async () => defaultActionResult,
    updateDiscovery: async () => defaultActionResult,
    updateAgent: async () => defaultActionResult,
    updateAppearance: async () => defaultActionResult,
    updateIcons: async () => defaultActionResult,
    reset: async () => defaultActionResult,
    getMediaGrouping: async () => ({
      data: {
        success: true as const,
        data: { groups: [], assignments: {} },
      },
      error: null,
    }),
    updateMediaGrouping: async () => defaultActionResult,
  },
  getItem: async () => ({ data: null, error: { message: "Not found" } }),
  nodes: {
    removeCustomClass: async () => ({ data: { version: "v1" }, error: null }),
  },
};
