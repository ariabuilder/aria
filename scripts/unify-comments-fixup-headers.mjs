/**
 * Fix awkward "Foo Composable Manages..." headers left by judgment merge.
 * Usage: node scripts/unify-comments-fixup-headers.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");

const EXTS = new Set([".ts", ".tsx", ".js", ".vue", ".astro", ".mjs"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".astro", ".wrangler"].includes(entry.name)) continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function shortenHeaderProse(prose) {
  let s = prose.replace(/\s+/g, " ").trim();

  // "Foo Composable Manages/Handles/..." → drop title prefix
  s = s.replace(
    /^[\w./\s-]+?\b(?:Composable|Actions|Utilities|Index|Handlers?|Algorithm)\s+(?=(?:Manages|Handles|Provides|Tracks|Loads|Coordinates|Centralized|Frame-aware|Type-safe|Automatically|Unified))/i,
    "",
  );
  // "Centralized X for Y. Only exposes..." keep as-is but trim Centralized
  s = s.replace(/^Centralized\s+/i, "");
  s = s.replace(/\bfor the Aria( visual)?( page)? builder\.?/gi, "");
  s = s.replace(/\bin the Aria visual page builder\.?/gi, "");
  s = s.replace(/\bProvides\b/gi, "");
  s = s.replace(/\b(comprehensive|robust|seamless|powerful|flexible)\s+/gi, "");
  s = s.replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").replace(/\.\s*\./g, ".").trim();
  // Fix broken dotted identifiers that got sentence-cased (Astro. Locals)
  s = s.replace(/\bAstro\.\s+Locals\b/g, "Astro.locals");
  s = s.replace(/\b([A-Z][a-zA-Z]+)\.\s+([A-Z][a-z]+)\b/g, (m, a, b) => {
    // Only fix likely identifiers, not real sentence ends
    if (["Locals", "Locals.", "Ts"].includes(b) || b[0] === b[0].toUpperCase() && b.length < 12) {
      return `${a}.${b.charAt(0).toLowerCase()}${b.slice(1)}`;
    }
    return m;
  });

  // Keep max 2 sentences
  const sentences =
    s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [s];
  let keep = sentences.slice(0, 2).join(" ");
  if (keep.length > 180) keep = keep.slice(0, 160).replace(/\s+\S*$/, "");
  keep = keep.replace(/^[a-z]/, (c) => c.toUpperCase());
  if (!/[.!?]$/.test(keep)) keep += ".";
  // Drop trailing orphan commas from truncation
  keep = keep.replace(/,\s*\.$/, ".");
  return keep;
}

function formatJsdoc(prose) {
  if (prose.length <= 95) return `/**\n * ${prose}\n */`;
  const words = prose.split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  return `/**\n * ${words.slice(0, mid).join(" ")}\n * ${words.slice(mid).join(" ")}\n */`;
}

function transform(source) {
  // Only rewrite top-of-file JSDoc that looks awkward
  const re = /^(\/\*\*[\s\S]*?\*\/)\n*/;
  const m = source.match(re);
  if (!m) return { text: source, changed: false };
  const block = m[1];
  const prose = block
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter((l) => l && !l.startsWith("@"))
    .join(" ");

  const awkward =
    /\bComposable\s+(Manages|Handles|Provides|Centralized)/i.test(prose) ||
    /\b(?:Actions|Utilities|Index|Handlers?)\s+(Manages|Handles|Provides)/i.test(prose) ||
    /Astro\.\s+Locals/.test(prose) ||
    /\bin the Aria visual page builder/i.test(prose) ||
    /\bCentralized\s+/i.test(prose) ||
    prose.length > 160;

  if (!awkward) return { text: source, changed: false };

  const tags = (block.match(/^\s*\*\s*@\w+.*$/gm) || []).map((t) =>
    t.replace(/^\s*/, " "),
  );
  const short = shortenHeaderProse(prose);
  let replacement;
  if (tags.length) {
    replacement = `/**\n * ${short}\n${tags.join("\n")}\n */\n\n`;
  } else {
    replacement = formatJsdoc(short) + "\n\n";
  }

  const text = replacement + source.slice(m[0].length);
  return { text, changed: text !== source };
}

const files = ["aria", "src"].flatMap((r) => walk(path.join(ROOT, r)));
let modified = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const { text, changed } = transform(source);
  if (!changed) continue;
  modified++;
  if (!DRY) fs.writeFileSync(file, text);
  console.log(" ", path.relative(ROOT, file));
}
console.log(`${DRY ? "[dry-run] " : ""}Fixed ${modified} headers`);
