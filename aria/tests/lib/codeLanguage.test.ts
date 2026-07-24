import { describe, expect, it } from "vitest";

import {
  buildRenderedCodeMarkup,
  getCodeBlockRenderMode,
  inferCodeLanguage,
} from "../../lib/utils/codeLanguage";

describe("inferCodeLanguage", () => {
  it("defaults to javascript for regular code", () => {
    expect(inferCodeLanguage("console.log('hello')")).toBe("javascript");
  });

  it("detects html snippets", () => {
    expect(inferCodeLanguage("<span>Hello</span>")).toBe("html");
  });

  it("detects css blocks", () => {
    expect(inferCodeLanguage(".card { color: red; }")).toBe("css");
  });

  it("detects json payloads", () => {
    expect(inferCodeLanguage('{"ok":true}')).toBe("json");
  });

  it("defaults render mode to display", () => {
    expect(getCodeBlockRenderMode(undefined)).toBe("display");
  });

  it("wraps plain javascript for render mode execution", () => {
    expect(buildRenderedCodeMarkup("console.log('hi')")).toBe(
      "<script>console.log('hi')</script>",
    );
  });

  it("wraps plain css for render mode execution", () => {
    expect(buildRenderedCodeMarkup(".card { color: red; }")).toBe(
      "<style>.card { color: red; }</style>",
    );
  });

  it("keeps html snippets intact for render mode", () => {
    expect(buildRenderedCodeMarkup("<span>Hello</span>")).toBe(
      "<span>Hello</span>",
    );
  });
});
