import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import { isMainModule } from "./lib/node-command";

const workspaceRoot = path.resolve(import.meta.dirname, "../..");
const SOURCE_EXTENSIONS = new Set([".astro", ".ts", ".tsx", ".vue"]);
const EXCLUDED_DIRECTORIES = new Set([
  ".astro",
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);

export type TypeSafetyProblem = Readonly<{
  file: string;
  line: number;
  message: string;
}>;

type SourceSegment = Readonly<{
  text: string;
  startLine: number;
}>;

function countLinesBefore(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/u).length - 1;
}

function embeddedScriptSegments(source: string): SourceSegment[] {
  const segments: SourceSegment[] = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/giu;

  for (const match of source.matchAll(scriptPattern)) {
    const text = match[1];
    if (text === undefined || match.index === undefined) continue;
    const relativeStart = match[0].indexOf(text);
    segments.push({
      text,
      startLine: countLinesBefore(source, match.index + relativeStart),
    });
  }

  return segments;
}

function sourceSegments(file: string, source: string): SourceSegment[] {
  const extension = path.extname(file);
  if (extension === ".ts" || extension === ".tsx") {
    return [{ text: source, startLine: 0 }];
  }

  const segments = embeddedScriptSegments(source);
  if (extension === ".astro") {
    const frontmatter = /^\s*---\s*\r?\n([\s\S]*?)\r?\n---/u.exec(source);
    if (frontmatter?.[1] !== undefined && frontmatter.index !== undefined) {
      const relativeStart = frontmatter[0].indexOf(frontmatter[1]);
      segments.unshift({
        text: frontmatter[1],
        startLine: countLinesBefore(source, frontmatter.index + relativeStart),
      });
    }
  }

  return segments;
}

function inspectCommentDirectives(
  file: string,
  segment: SourceSegment,
): TypeSafetyProblem[] {
  const problems: TypeSafetyProblem[] = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    segment.text,
  );

  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFileToken;
    token = scanner.scan()
  ) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }

    const comment = scanner.getTokenText();
    const directive = /@ts-(?:ignore|nocheck)\b/u.exec(comment);
    if (!directive) continue;
    const line =
      countLinesBefore(
        segment.text,
        scanner.getTokenStart() + directive.index,
      ) +
      1 +
      segment.startLine;
    problems.push({
      file,
      line,
      message: `${directive[0]} is forbidden; model the boundary explicitly`,
    });
  }

  return problems;
}

function inspectTypeScriptSegment(
  file: string,
  segment: SourceSegment,
): TypeSafetyProblem[] {
  const problems = inspectCommentDirectives(file, segment);
  const sourceFile = ts.createSourceFile(
    file,
    segment.text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function report(node: ts.Node, message: string): void {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1 +
      segment.startLine;
    problems.push({ file, line, message });
  }

  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      report(node, "explicit any is forbidden");
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "z" &&
      node.expression.name.text === "any"
    ) {
      report(
        node,
        "z.any() is forbidden; use a concrete schema or z.unknown()",
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return problems;
}

export function inspectTypeSafetySource(
  file: string,
  source: string,
): TypeSafetyProblem[] {
  return sourceSegments(file, source).flatMap((segment) =>
    inspectTypeScriptSegment(file, segment),
  );
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name))
        return [];
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(absolute);
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        return [];
      }
      return [absolute];
    }),
  );
  return nested.flat().sort();
}

export async function checkTypeSafety(): Promise<void> {
  const files = await listSourceFiles(workspaceRoot);
  const problems = (
    await Promise.all(
      files.map(async (file) =>
        inspectTypeSafetySource(file, await readFile(file, "utf8")),
      ),
    )
  ).flat();

  if (problems.length > 0) {
    const detail = problems
      .map(
        (problem) =>
          `${path.relative(workspaceRoot, problem.file)}:${problem.line}: ${problem.message}`,
      )
      .join("\n");
    throw new Error(`Type-safety boundary failed:\n${detail}`);
  }

  console.log(
    `Type-safety boundary passed: ${files.length} repo-owned TypeScript surfaces contain no explicit any or suppression directives.`,
  );
}

if (isMainModule(import.meta.url)) {
  await checkTypeSafety();
}
