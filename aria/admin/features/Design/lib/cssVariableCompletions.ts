import {
  CompletionContext,
  type Completion,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { cssCompletionSource, cssLanguage } from "@codemirror/lang-css";
import { EditorState } from "@codemirror/state";

import type { VariableReferenceOption } from "@/lib/variableReferences";

const DECLARATION_WRAPPER_PREFIX = ".aria-declaration { ";
const DECLARATION_WRAPPER_SUFFIX = " }";

function toCssVariableName(value: string): string {
  return `--${value.trim().replace(/^--/, "")}`;
}

/**
 * Converts Variable Manager entries into CodeMirror completion options. The
 * editor only inserts the custom-property name, preserving the.
 */
export function buildCssVariableCompletionOptions(
  variableReferences: readonly VariableReferenceOption[],
): Completion[] {
  const seen = new Set<string>();

  return variableReferences.flatMap((variable) => {
    const name = toCssVariableName(variable.value);

    if (seen.has(name)) {
      return [];
    }

    seen.add(name);

    return [
      {
        label: name,
        apply: name,
        detail: variable.meta,
        type: "variable",
      },
    ];
  });
}

function getVariableReferenceMatch(context: CompletionContext) {
  const match = context.matchBefore(/--[\w-]*/);

  if (!match) {
    return null;
  }

  const beforeVariable = context.state.sliceDoc(
    Math.max(0, match.from - 16),
    match.from,
  );

  return /var\(\s*$/i.test(beforeVariable) ? match : null;
}

function createDeclarationCompletionContext(context: CompletionContext) {
  const state = EditorState.create({
    doc: `${DECLARATION_WRAPPER_PREFIX}${context.state.doc.toString()}${DECLARATION_WRAPPER_SUFFIX}`,
    extensions: [cssLanguage],
  });

  return new CompletionContext(
    state,
    DECLARATION_WRAPPER_PREFIX.length + context.pos,
    context.explicit,
  );
}

function rebaseDeclarationCompletion(
  result: CompletionResult,
): CompletionResult {
  return {
    ...result,
    from: result.from - DECLARATION_WRAPPER_PREFIX.length,
  };
}

function mergeCompletionOptions(
  standardOptions: readonly Completion[],
  variableOptions: readonly Completion[],
): Completion[] {
  const seen = new Set<string>();

  return [...standardOptions, ...variableOptions].filter((option) => {
    const key = option.apply ?? option.label;
    const normalizedKey = typeof key === "string" ? key : option.label;

    if (seen.has(normalizedKey)) {
      return false;
    }

    seen.add(normalizedKey);
    return true;
  });
}

/**
 * Supplies standard CSS completion for a declarations-only editor. CodeMirror's CSS
 * source expects a complete stylesheet, so the draft is.
 */
export function createCssDeclarationCompletionSource(
  getVariableReferences: () => readonly VariableReferenceOption[],
): CompletionSource {
  return async (context) => {
    const declarationContext = createDeclarationCompletionContext(context);
    const completion = await cssCompletionSource(declarationContext);
    const variableMatch = getVariableReferenceMatch(context);
    const variableOptions = variableMatch
      ? buildCssVariableCompletionOptions(getVariableReferences())
      : [];

    if (!completion && !variableMatch) {
      return null;
    }

    if (!completion) {
      return variableOptions.length > 0
        ? {
            from: variableMatch?.from ?? context.pos,
            options: variableOptions,
            validFor: /^--[\w-]*$/,
          }
        : null;
    }

    const rebasedCompletion = rebaseDeclarationCompletion(completion);

    return {
      ...rebasedCompletion,
      ...(variableMatch && variableOptions.length > 0
        ? {
            from: variableMatch.from,
            options: mergeCompletionOptions(
              rebasedCompletion.options,
              variableOptions,
            ),
            validFor: /^--[\w-]*$/,
          }
        : {}),
    };
  };
}
