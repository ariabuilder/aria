import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeEditorHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
    color: "var(--code-editor-token-keyword)",
  },
  {
    tag: [tags.name, tags.variableName, tags.propertyName],
    color: "var(--code-editor-token-name)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.attributeValue],
    color: "var(--code-editor-token-string)",
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null],
    color: "var(--code-editor-token-literal)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--code-editor-token-comment)",
    fontStyle: "italic",
  },
  {
    tag: [tags.className, tags.typeName, tags.namespace],
    color: "var(--code-editor-token-type)",
  },
  {
    tag: [tags.tagName, tags.attributeName],
    color: "var(--code-editor-token-tag)",
  },
  {
    tag: [tags.punctuation, tags.separator, tags.bracket, tags.angleBracket],
    color: "var(--code-editor-token-punctuation)",
  },
  {
    tag: [tags.operator, tags.compareOperator, tags.logicOperator],
    color: "var(--code-editor-token-operator)",
  },
]);
