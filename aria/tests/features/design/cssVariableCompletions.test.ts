import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  buildCssVariableCompletionOptions,
  createCssDeclarationCompletionSource,
} from "../../../admin/features/Design/lib/cssVariableCompletions";

const variableReferences = [
  {
    value: "brand-primary",
    label: "Brand Primary",
    meta: "Color · --brand-primary",
    group: "Custom Variables",
  },
  {
    value: "heading-font",
    label: "Heading Font",
    meta: "Alias · --heading-font",
    group: "Aliases",
  },
];

describe("cssVariableCompletions", () => {
  it("creates descriptive completions for Variable Manager references", () => {
    expect(buildCssVariableCompletionOptions(variableReferences)).toEqual([
      {
        label: "--brand-primary",
        apply: "--brand-primary",
        detail: "Color · --brand-primary",
        type: "variable",
      },
      {
        label: "--heading-font",
        apply: "--heading-font",
        detail: "Alias · --heading-font",
        type: "variable",
      },
    ]);
  });

  it("dedupes variable names when a caller supplies duplicate entries", () => {
    expect(
      buildCssVariableCompletionOptions([
        ...variableReferences,
        { ...variableReferences[0], label: "Duplicate" },
      ]),
    ).toHaveLength(2);
  });

  it("suggests variables only inside a var() reference", async () => {
    const source = createCssDeclarationCompletionSource(
      () => variableReferences,
    );
    const css = "color: var(--bra";
    const state = EditorState.create({ doc: css });
    const result = await source(
      new CompletionContext(state, css.length, false),
    );

    expect(result).toMatchObject({
      from: css.indexOf("--"),
      validFor: /^--[\w-]*$/,
    });
    expect(result?.options.map((option) => option.label)).toEqual([
      "--brand-primary",
      "--heading-font",
    ]);
  });

  it("does not inject Variable Manager references into arbitrary CSS text", async () => {
    const source = createCssDeclarationCompletionSource(
      () => variableReferences,
    );
    const css = "--brand";
    const state = EditorState.create({ doc: css });

    const result = await source(
      new CompletionContext(state, css.length, false),
    );

    expect(result?.options.map((option) => option.label)).not.toContain(
      "--brand-primary",
    );
  });

  it("suggests standard CSS properties in a declarations-only draft", async () => {
    const source = createCssDeclarationCompletionSource(
      () => variableReferences,
    );
    const css = "font-";
    const state = EditorState.create({ doc: css });
    const result = await source(
      new CompletionContext(state, css.length, false),
    );

    expect(result?.from).toBe(0);
    expect(result?.options.some((option) => option.label === "font-size")).toBe(
      true,
    );
  });
});
