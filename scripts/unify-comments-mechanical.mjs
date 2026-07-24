/**
 * Mechanical comment cleanup — strips AI brochure theater from first-party source.
 * Comments-only transforms; does not change code behavior.
 *
 * Usage: node scripts/unify-comments-mechanical.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");

const ROOTS = ["aria", "src"];
const EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".vue",
  ".astro",
  ".mjs",
  ".cjs",
]);

const EXCLUDE_DIR_PARTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}.astro${path.sep}`,
  `${path.sep}.wrangler${path.sep}`,
  `${path.sep}openapi${path.sep}`,
  `${path.sep}i18n${path.sep}messages${path.sep}`,
  `${path.sep}storage${path.sep}generated${path.sep}`,
  `${path.sep}storage${path.sep}exports${path.sep}`,
  `${path.sep}storage${path.sep}snapshots${path.sep}`,
  `${path.sep}storage${path.sep}thumbnails${path.sep}`,
  `${path.sep}migrations${path.sep}`,
  `${path.sep}public${path.sep}vendor${path.sep}`,
];

function shouldSkip(filePath) {
  if (EXCLUDE_DIR_PARTS.some((p) => filePath.includes(p))) return true;
  if (filePath.endsWith("uno.css")) return true;
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".astro" ||
        entry.name === ".wrangler"
      ) {
        continue;
      }
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name)) && !shouldSkip(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Line is only a decorative banner (===== or box-drawing). */
function isBannerLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("<!--")) {
    return false;
  }
  // // ===... or // ---... or // ───...
  const body = trimmed
    .replace(/^\/\/\s*/, "")
    .replace(/^\*\s*/, "")
    .replace(/^<!--\s*/, "")
    .replace(/\s*-->$/, "")
    .trim();

  if (!body) return false;

  // Pure separator: mostly = - ─ ═ characters, optional short ALL-CAPS label on same line
  if (/^[=\-─═]{8,}$/.test(body)) return true;
  if (/^[=\-─═]{3,}\s+[A-Z0-9 _/:-]{1,40}\s*[=\-─═]{3,}$/.test(body)) return true;
  if (/^[─═\-]=*\s+.+\s+[─═\-]+$/.test(body) && body.length > 20) return true;
  // // ─── Sync watch ───
  if (/^[─]{2,}.+[─]{2,}$/.test(body)) return true;
  // Standalone ALL-CAPS section title between banners (handled with neighbors)
  return false;
}

/** ALL-CAPS section title that sat between banners, e.g. "// TYPE DEFINITIONS" or "// DOMAIN TYPES - ..." */
function isBannerTitleLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("//")) return false;
  const body = trimmed.slice(2).trim();
  if (!body || body.length > 80) return false;
  const skip = new Set(["TODO", "FIXME", "HACK", "NOTE", "XXX"]);
  if (skip.has(body)) return false;
  // ALL CAPS label, optional " - description"
  if (/^[A-Z][A-Z0-9 _/:-]{1,50}(?:\s+-\s+.+)?$/.test(body) && /[A-Z]{2,}/.test(body)) {
    // Must be mostly uppercase words before the dash
    const head = body.split(/\s+-\s+/)[0];
    if (/^[A-Z0-9 _/:-]+$/.test(head) && head.split(/\s+/).length <= 6) return true;
  }
  return false;
}

const SECTION_HEADERS =
  /^(Features|Architecture|Usage Pattern|Usage|Key Features|Overview|Responsibilities|Examples?|Use Cases|Notes|Benefits|Goals|Design Goals|Implementation Notes)\s*:?\s*$/i;

function transformContent(source) {
  const lines = source.split("\n");
  const out = [];
  let i = 0;
  let changed = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Strip @module / @version lines (JSDoc, //, or HTML comment form)
    if (
      /^(\*|\/\/)\s*@module\b/.test(trimmed) ||
      /^(\*|\/\/)\s*@version\b/.test(trimmed) ||
      /^\*\s*@module\b/.test(trimmed) ||
      /^\*\s*@version\b/.test(trimmed) ||
      /^<!--\s*@module\b/.test(trimmed) ||
      /^<!--\s*@version\b/.test(trimmed) ||
      /^@module\b/.test(trimmed) ||
      /^@version\b/.test(trimmed)
    ) {
      changed = true;
      i++;
      continue;
    }

    // Block-comment banners: /* ===== ... */ spanning 1–3 lines
    if (
      /^\/\*\s*={5,}/.test(trimmed) ||
      /^\/\*={5,}/.test(trimmed)
    ) {
      changed = true;
      i++;
      // Consume following * TITLE and * ===== */ lines
      while (i < lines.length) {
        const t = lines[i].trim();
        if (
          /^\*\s*={5,}/.test(t) ||
          /^\*\s*[A-Z0-9 _/:-]{2,40}\s*$/.test(t) ||
          t === "*/" ||
          /^\*\/\s*$/.test(t) ||
          /^\*\s*$/.test(t)
        ) {
          i++;
          if (t === "*/" || /^\*\/\s*$/.test(t) || (/^\*\s*={5,}/.test(t) && t.includes("*/"))) {
            break;
          }
          // Line like `* ===== */`
          if (/={5,}.*\*\/\s*$/.test(t)) break;
          continue;
        }
        break;
      }
      continue;
    }

    // Standalone `* ===== */` closing banner line if somehow orphaned
    if (/^\*\s*={5,}.*\*\/\s*$/.test(trimmed) || /^={5,}.*\*\/\s*$/.test(trimmed)) {
      changed = true;
      i++;
      continue;
    }

    // // ===== banner separators
    if (isBannerLine(line)) {
      changed = true;
      i++;
      if (i < lines.length && isBannerTitleLine(lines[i])) {
        i++;
        if (i < lines.length && isBannerLine(lines[i])) {
          i++;
        }
      }
      continue;
    }

    // Orphan ALL-CAPS / section title lines (even without surrounding banners)
    if (isBannerTitleLine(line)) {
      changed = true;
      i++;
      continue;
    }

    // Inside JSDoc only: drop Features:/Architecture: section blocks.
    // Do NOT match bare template/prose lines (e.g. Vue "Usage" labels) — that deletes code.
    if (trimmed.startsWith("*") && SECTION_HEADERS.test(trimmed.replace(/^\*\s*/, ""))) {
      changed = true;
      i++;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === "*/") break;
        if (t === "*" || t === "" || /^\*\s*$/.test(t)) {
          i++;
          continue;
        }
        const body = t.replace(/^\*\s*/, "").trim();
        if (SECTION_HEADERS.test(body)) {
          i++;
          continue;
        }
        if (/^\*\s*[-•*]/.test(t) || /^\*\s+\d+\./.test(t)) {
          i++;
          continue;
        }
        if (/^\*\s{2,}/.test(t) && !/^\*\s*@/.test(t)) {
          i++;
          continue;
        }
        break;
      }
      continue;
    }

    // Inside HTML comments only: track when we're in <!-- --> and strip section blocks there
    // (handled separately below via a second pass on HTML comment ranges)

    // Normalize "Why: ..." → drop prefix (// and * forms)
    const whyMatch = trimmed.match(/^(\/\/|\*)\s*Why:\s*(.+)$/i);
    if (whyMatch) {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const prefix = whyMatch[1];
      const rest = whyMatch[2];
      out.push(`${indent}${prefix} ${rest}`);
      changed = true;
      i++;
      continue;
    }

    // Multi-line Why: in JSDoc: "* Why: ..." already handled; also "* Why:" alone then next line
    if (/^(\/\/|\*)\s*Why:\s*$/i.test(trimmed)) {
      changed = true;
      i++;
      continue;
    }

    out.push(line);
    i++;
  }

  // Collapse runs of 2+ blank lines to 1
  const collapsed = [];
  let blankRun = 0;
  for (const line of out) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 1) collapsed.push(line);
      else changed = true;
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  // Clean trailing blank "* " lines before closing */
  let text = collapsed.join("\n");
  const beforeClean = text;
  text = text.replace(/(\n\s*\*\s*)+\n(\s*\*\/)/g, "\n$2");
  // Clean empty JSDoc shells
  text = text.replace(/\/\*\*\s*\n(\s*\*\s*\n)*\s*\*\/\s*\n?/g, "");
  text = text.replace(/\/\*\*\n(\s*\*\n)+\s*\*\//g, "");
  // Clean empty HTML comment shells
  text = text.replace(/<!--\s*\n(\s*\n)*\s*-->\s*\n?/g, "");
  if (text !== beforeClean) changed = true;

  return { text, changed: changed || text !== source };
}

const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
let modified = 0;
const touched = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const { text, changed } = transformContent(source);
  if (!changed || text === source) continue;
  modified++;
  touched.push(path.relative(ROOT, file));
  if (!DRY) {
    fs.writeFileSync(file, text, "utf8");
  }
}

console.log(
  `${DRY ? "[dry-run] " : ""}Modified ${modified} / ${files.length} files`,
);
if (touched.length && touched.length <= 80) {
  for (const t of touched) console.log(`  ${t}`);
} else if (touched.length) {
  for (const t of touched.slice(0, 40)) console.log(`  ${t}`);
  console.log(`  ... and ${touched.length - 40} more`);
}
