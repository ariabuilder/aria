import { asSchema } from "ai";
import { describe, expect, it } from "vitest";
import { createRuntimeCapabilityRegistry } from "../../../admin/features/Agent/lib/capabilities/runtimeRegistry";
import {
  getServerToolInputJsonSchema,
  SERVER_TOOL_INPUT_ZOD_SCHEMAS,
} from "../../../admin/features/Agent/lib/capabilities/serverToolSchemas";
import { buildServerAiTools } from "../../../admin/features/Agent/lib/tools/buildAiTools";
import {
  SERVER_ADMIN_TOOL_NAMES,
  SERVER_TOOL_NAMES,
} from "../../../admin/features/Agent/lib/tools/constants";
import type { AgentToolActionContext } from "../../../admin/features/Agent/lib/tools/types";
import type { SessionUser } from "../../../lib/auth/types";

const adminUser: SessionUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  username: "admin",
  email: "admin@example.com",
  role: "administrator",
  totpEnabled: false,
  preferences: {},
};

function createContext(): AgentToolActionContext {
  return {
    locals: {} as App.Locals,
    request: new Request("https://aria.test/admin"),
    user: adminUser,
  };
}

describe("agent capability registry", () => {
  it("has one canonical Zod input schema for every server command", () => {
    expect(Object.keys(SERVER_TOOL_INPUT_ZOD_SCHEMAS).sort()).toEqual(
      [...SERVER_TOOL_NAMES].sort(),
    );
  });

  it("keeps Studio AI tool schemas aligned with the canonical inventory", async () => {
    const tools = buildServerAiTools({
      transport: "mcp",
      actionContext: createContext(),
      exposeAllCapabilities: true,
    });
    const registry = createRuntimeCapabilityRegistry(tools);

    const expectedMcpTools = SERVER_TOOL_NAMES.filter(
      (name) => !(SERVER_ADMIN_TOOL_NAMES as readonly string[]).includes(name),
    );
    expect([...registry.keys()].sort()).toEqual([...expectedMcpTools].sort());

    for (const toolName of expectedMcpTools) {
      const runtimeTool = registry.get(toolName)?.tool;
      expect(runtimeTool, `missing runtime tool ${toolName}`).toBeDefined();
      expect(runtimeTool?.description?.trim().length).toBeGreaterThan(0);

      const runtimeJsonSchema = await asSchema(runtimeTool?.inputSchema)
        .jsonSchema;
      expect(runtimeJsonSchema).toEqual(getServerToolInputJsonSchema(toolName));
    }
  });

  it("exposes isolated administrator tools only in authenticated Studio", () => {
    const studio = createRuntimeCapabilityRegistry(
      buildServerAiTools({
        transport: "studio_ws",
        actionContext: createContext(),
        exposeAllCapabilities: true,
      }),
    );
    const mcp = createRuntimeCapabilityRegistry(
      buildServerAiTools({
        transport: "mcp",
        actionContext: createContext(),
        exposeAllCapabilities: true,
      }),
    );

    for (const name of SERVER_ADMIN_TOOL_NAMES) {
      expect(studio.has(name)).toBe(true);
      expect(mcp.has(name)).toBe(false);
    }
  });

  it("keeps production model context compact while retaining discovery", () => {
    const tools = buildServerAiTools({
      transport: "studio_ws",
      actionContext: createContext(),
    });

    expect(Object.keys(tools).length).toBeLessThan(30);
    expect(tools).toHaveProperty("aria_get_site_context");
    expect(tools).toHaveProperty("aria_search_commands");
    expect(tools).toHaveProperty("aria_describe_command");
    expect(tools).toHaveProperty("aria_execute_command");
    expect(tools).toHaveProperty("aria_set_design_system_primary_color");
    expect(tools).toHaveProperty("aria_list_element_types");
    expect(tools).toHaveProperty("aria_get_node_capabilities");
    expect(tools).not.toHaveProperty("aria_search_library");
  });
});
