import { describe, expect, it } from "vitest";
import {
  assertExecutableContentChangeAllowed,
  introducesExecutableContent,
} from "../../../lib/security/executableContent";
import type { BuilderNode, JsonObject } from "../../../lib/types/nodes";
import type { SessionUser } from "../../../lib/auth/types";

function node(id: string, props: JsonObject): BuilderNode {
  return { id, type: "Code", props, styles: {}, children: [] };
}

const editor: SessionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "editor",
  email: "editor@example.com",
  role: "content-editor",
  totpEnabled: false,
};

const customCodeEditor = {
  ...editor,
  permissionProfile: {
    rolePreset: "content-editor",
    capabilityOverrides: { allow: ["editCustomCode"] },
  },
} as SessionUser;

describe("executable content authorization", () => {
  it("detects a new rendered Code block", () => {
    expect(
      introducesExecutableContent(
        [],
        [node("code-1", { renderMode: "render", content: "alert(1)" })],
      ),
    ).toBe(true);
  });

  it("allows an unchanged rendered Code block", () => {
    const nodes = [
      node("code-1", { renderMode: "render", content: "alert(1)" }),
    ];
    expect(introducesExecutableContent(nodes, structuredClone(nodes))).toBe(
      false,
    );
  });

  it("allows removing executable content without the capability", () => {
    expect(() =>
      assertExecutableContentChangeAllowed({
        user: editor,
        previousNodes: [
          node("code-1", { renderMode: "render", content: "alert(1)" }),
        ],
        nextNodes: [],
      }),
    ).not.toThrow();
  });

  it("denies changing executable content without the capability", () => {
    expect(() =>
      assertExecutableContentChangeAllowed({
        user: editor,
        previousNodes: [
          node("code-1", { renderMode: "render", content: "old()" }),
        ],
        nextNodes: [node("code-1", { renderMode: "render", content: "new()" })],
      }),
    ).toThrow(/editCustomCode/);
  });

  it("allows changing executable content with the capability", () => {
    expect(() =>
      assertExecutableContentChangeAllowed({
        user: customCodeEditor,
        nextNodes: [
          node("code-1", { renderMode: "render", content: "allowed()" }),
        ],
      }),
    ).not.toThrow();
  });

  it("treats unsafe SVG and page head HTML as executable content", () => {
    const svg = {
      id: "svg-1",
      type: "Svg",
      props: { content: '<path onload="alert(1)" />' },
      styles: {},
      children: [],
    } satisfies BuilderNode;
    expect(introducesExecutableContent([], [svg])).toBe(true);
    expect(
      introducesExecutableContent([], [], "", "<script>x()</script>"),
    ).toBe(true);
  });
});
