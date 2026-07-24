import { describe, expect, it } from "vitest";

import { createUserUnoConfig } from "../../../uno.user.config";
import {
  generateUserUnoConfig,
  getUnoCSSTags,
} from "../../lib/styles/user-uno";

describe("user Uno defaults", () => {
  it("keeps publish-time Uno button shortcuts aligned with supported variants", () => {
    const config = createUserUnoConfig();

    expect(config.shortcuts).toEqual(
      expect.objectContaining({
        "btn-primary": expect.any(String),
        "btn-secondary": expect.any(String),
        "btn-muted": expect.any(String),
        "btn-destructive": expect.any(String),
      }),
    );
    expect(config.shortcuts).not.toHaveProperty("btn-outline");
    expect(config.shortcuts).not.toHaveProperty("btn-ghost");
    expect(config.theme.colors).toEqual(
      expect.objectContaining({
        destructive: "hsl(var(--destructive) / <alpha-value>)",
        "destructive-foreground":
          "hsl(var(--destructive-foreground) / <alpha-value>)",
      }),
    );
  });

  it("keeps runtime Uno tags aligned with the shared system button shortcuts", () => {
    const runtimeConfig = generateUserUnoConfig();
    const runtimeTags = getUnoCSSTags();

    expect(runtimeConfig.shortcuts).toEqual(
      expect.objectContaining({
        "btn-primary": expect.any(String),
        "btn-secondary": expect.any(String),
        "btn-muted": expect.any(String),
        "btn-destructive": expect.any(String),
      }),
    );
    expect(runtimeConfig.shortcuts).not.toHaveProperty("btn-outline");
    expect(runtimeConfig.shortcuts).not.toHaveProperty("btn-ghost");
    expect(runtimeTags).toContain('"btn-muted"');
    expect(runtimeTags).not.toContain('"btn-outline"');
    expect(runtimeTags).not.toContain('"btn-ghost"');
  });
});
