/**
 * Judgment-assist: shorten verbose file headers and drop restating JSDoc.
 * Usage: node scripts/unify-comments-judgment.mjs [--dry-run] [path...]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DRY = process.argv.includes("--dry-run");
const pathArgs = process.argv.slice(2).filter((a) => a !== "--dry-run");

const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".vue", ".astro", ".mjs", ".cjs"]);
const EXCLUDE_DIR_PARTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}.astro${path.sep}`,
  `${path.sep}.wrangler${path.sep}`,
  `${path.sep}openapi${path.sep}`,
  `${path.sep}i18n${path.sep}messages${path.sep}`,
  `${path.sep}storage${path.sep}generated${path.sep}`,
  `${path.sep}migrations${path.sep}`,
];

const MARKETING =
  /\b(comprehensive|robust|seamless|powerful|flexible|elegant|state-of-the-art|cutting-edge|leverages|utilizes|facilitates|ensures|provides\s+(comprehensive|robust)|for the Aria visual page builder)\b/i;

const KEEP_TAG = /@(deprecated|default|param|returns?|throws|example|see|template|typeParam)\b/;

function shouldSkip(filePath) {
  return EXCLUDE_DIR_PARTS.some((p) => filePath.includes(p));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".astro", ".wrangler"].includes(entry.name)) continue;
      walk(full, out);
    } else if (EXTS.has(path.extname(entry.name)) && !shouldSkip(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Extract prose lines from a JSDoc block (no leading * ). */
function jsdocProse(block) {
  return block
    .replace(/^\/\*\*?/, "")
    .replace(/\*\/$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("@"));
}

function shortenProse(proseLines) {
  if (proseLines.length === 0) return null;
  let lines = [...proseLines];
  // Drop title lines like "Foo Composable - Bar Baz" or "Foo.vue - Description"
  if (
    lines.length > 1 &&
    (/ - /.test(lines[0]) || /Composable$/i.test(lines[0]) || /\.vue\b/i.test(lines[0])) &&
    lines[0].length < 90
  ) {
    lines = lines.slice(1);
  }
  // If first line is Title Case label and second is real prose, drop first
  if (
    lines.length > 1 &&
    /^[A-Z][\w\s/-]+$/.test(lines[0]) &&
    lines[0].split(/\s+/).length <= 8 &&
    /[a-z]/.test(lines[1])
  ) {
    lines = lines.slice(1);
  }

  let cleaned = lines
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s*for the Aria visual page builder\.?/gi, "")
    .replace(/\bProvides\b/gi, "")
    .replace(/\b(comprehensive|robust|seamless|powerful|flexible)\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();

  // Fix ". using" artifacts from clause removal
  cleaned = cleaned.replace(/\.\s+([a-z])/g, (_, c) => `. ${c.toUpperCase()}`);
  cleaned = cleaned.replace(/^[a-z]/, (c) => c.toUpperCase());

  const sentences =
    cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [
      cleaned,
    ];
  let keep = sentences.slice(0, 2).join(" ");
  if (keep.length > 200) {
    keep = keep.slice(0, 180).replace(/\s+\S*$/, "");
  }
  if (!/[.!?]$/.test(keep)) keep += ".";
  return keep;
}

function formatJsdoc(prose, indent = "") {
  if (!prose) return "";
  const words = prose.split(/\s+/);
  if (prose.length <= 90) {
    return `${indent}/**\n${indent} * ${prose}\n${indent} */`;
  }
  // Split into ~2 lines
  const mid = Math.ceil(words.length / 2);
  const a = words.slice(0, mid).join(" ");
  const b = words.slice(mid).join(" ");
  return `${indent}/**\n${indent} * ${a}\n${indent} * ${b}\n${indent} */`;
}

function formatHtmlComment(prose) {
  if (!prose) return "";
  if (prose.length <= 100) {
    return `<!--\n  ${prose}\n-->`;
  }
  const words = prose.split(/\s+/);
  const mid = Math.ceil(words.length / 2);
  return `<!--\n  ${words.slice(0, mid).join(" ")}\n  ${words.slice(mid).join(" ")}\n-->`;
}

/** True if one-line JSDoc is likely restating the next identifier. */
function isRestatingJsdoc(commentBody, nextLine) {
  const body = commentBody.replace(/\s+/g, " ").trim();
  if (!body || KEEP_TAG.test(body)) return false;
  if (body.length > 100) return false;
  // Keep comments with real constraints / rationale
  if (
    /\b(e\.g\.|eg\.|must |should |only |never |avoid |null when|null for|in milliseconds|defaults? to|see |note:|important:|workaround|hack|because|so that|otherwise)\b/i.test(
      body,
    )
  ) {
    return false;
  }

  const idMatch = nextLine.match(
    /(?:(?:export|declare|abstract|async|readonly|public|private|protected|static|override)\s+)*(?:(?:async|get|set|function|class|interface|type|enum|const|let|var)\s+)?(\w+)/,
  );
  const prop = nextLine.match(/^\s*(?:readonly\s+)?(\w+)\s*[?:]/);
  const id = idMatch?.[1] ?? prop?.[1];
  if (!id) return false;
  return restatesId(body, id);
}

function restatesId(body, id) {
  const lower = body.toLowerCase();
  const idWords = id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const restatePatterns = [
    new RegExp(`^(the\\s+)?${idWords.join("\\s+")}\\.?$`, "i"),
    /^(a |an |the )?(unique )?(identifier|id)( of .+)?\.?$/i,
    /^(human[- ]readable )?(error )?message\.?$/i,
    /^(optional |required )?(flag|boolean|string|number|value|callback|handler|function|options?|configuration|config|settings?)\.?$/i,
    /^(total|number of|count of|list of|array of)\s+/i,
    /^enable(s|d)?\s+/i,
    /^whether\s+(to|the)\s+/i,
    /^(id|type|name|path|index|timestamp|duration|message|reason|code|severity|valid|error|suggestion)\s+(of|for|level|when|to)\b/i,
    /^(original |source |target |calculated |current |last |average )?(parent id|index|timestamp|duration|node|type|position)\b/i,
    /\b(being dragged|that failed validation|for programmatic handling|for execution|for drag-drop|of the error|of the node)\b/i,
    /^(allow|track|custom)\s+\w+/i,
  ];
  if (restatePatterns.some((p) => p.test(body))) return true;

  // "Drop position relative to target node." before DropPosition — restating type name
  if (
    idWords.length >= 1 &&
    idWords.every((w) => lower.includes(w)) &&
    body.split(/\s+/).length <= idWords.length + 6
  ) {
    // Contains all id words and little else → likely restating
    const filler = lower
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (w) =>
          w &&
          !idWords.includes(w) &&
          !["the", "a", "an", "of", "for", "to", "in", "on", "with", "and", "or", "is", "when"].includes(
            w,
          ),
      );
    if (filler.length <= 3) return true;
  }

  const bodyWords = lower.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (bodyWords.length <= idWords.length + 2) {
    const idSet = new Set(idWords);
    const overlap = bodyWords.filter(
      (w) => idSet.has(w) || ["the", "a", "an"].includes(w),
    ).length;
    if (overlap >= Math.min(bodyWords.length, idWords.length) && bodyWords.length <= 6) {
      return true;
    }
  }
  return false;
}

function transform(source, filePath) {
  let text = source;
  let changed = false;
  const isVue = filePath.endsWith(".vue");

  // --- Top HTML comment in Vue ---
  if (isVue) {
    const htmlHeader = text.match(/^<!--\n([\s\S]*?)\n-->\n*/);
    if (htmlHeader) {
      const inner = htmlHeader[1]
        .split("\n")
        .map((l) => l.replace(/^\s+/, "").trim())
        .filter((l) => l && !l.startsWith("@"));
      const long =
        inner.join(" ").length > 120 ||
        inner.length > 3 ||
        MARKETING.test(inner.join(" "));
      if (long) {
        const prose = shortenProse(inner);
        const replacement = prose ? formatHtmlComment(prose) + "\n" : "";
        text = text.slice(htmlHeader[0].length);
        text = replacement + text;
        changed = true;
      }
    }
  }

  // --- Top JSDoc file header (after optional shebang / 'use ...' / blank) ---
  {
    const headerRe =
      /^((?:#!.*\n)?)((?:['"]use \w+['"];?\n)*)(\s*)(\/\*\*[\s\S]*?\*\/)\n*/;
    const m = text.match(headerRe);
    if (m) {
      const block = m[4];
      const prose = jsdocProse(block);
      const tags = block.match(/^\s*\*\s*@\w+.*/gm) || [];
      const long =
        prose.join(" ").length > 90 ||
        prose.length > 2 ||
        MARKETING.test(prose.join(" ")) ||
        /Composable|Utilities|Type Definitions|for the Aria/i.test(prose.join(" "));
      // Only treat as file header if it sits before imports/exports
      const after = text.slice(m[0].length, m[0].length + 80);
      const looksLikeFileHeader =
        /^(import |export |const |let |var |function |class |type |interface |\/\*|\/\/)/m.test(
          after,
        ) || after.trimStart().startsWith("import");

      if (long && looksLikeFileHeader && tags.length === 0) {
        const short = shortenProse(prose);
        const replacement = short ? formatJsdoc(short) + "\n\n" : "\n";
        text = m[1] + m[2] + m[3] + replacement + text.slice(m[0].length);
        changed = true;
      } else if (long && looksLikeFileHeader && tags.length > 0) {
        // Keep useful tags, shorten prose
        const short = shortenProse(prose);
        const tagLines = tags.map((t) => t.replace(/^\s*/, " ")).join("\n");
        const body = short
          ? `/**\n * ${short}\n${tagLines}\n */`
          : `/**\n${tagLines}\n */`;
        text = m[1] + m[2] + m[3] + body + "\n\n" + text.slice(m[0].length);
        changed = true;
      }
    }
  }

  // --- Remove restating single-line /** ... */ before declarations ---
  {
    const lines = text.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const single = line.match(/^(\s*)\/\*\*\s*(.*?)\s*\*\/\s*$/);
      if (single) {
        const body = single[2];
        // Skip if has keep tags
        if (!KEEP_TAG.test(body)) {
          // Peek next non-empty line
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j < lines.length && isRestatingJsdoc(body, lines[j])) {
            changed = true;
            continue;
          }
        }
      }

      // Multi-line JSDoc that is only one short restating sentence
      if (/^\s*\/\*\*\s*$/.test(line)) {
        const blockLines = [line];
        let k = i + 1;
        while (k < lines.length && !lines[k].includes("*/")) {
          blockLines.push(lines[k]);
          k++;
        }
        if (k < lines.length) blockLines.push(lines[k]);
        const block = blockLines.join("\n");
        const prose = jsdocProse(block);
        const hasKeep = KEEP_TAG.test(block);
        if (!hasKeep && prose.length === 1 && prose[0].length < 70) {
          let j = k + 1;
          while (j < lines.length && lines[j].trim() === "") j++;
          if (j < lines.length && isRestatingJsdoc(prose[0], lines[j])) {
            changed = true;
            i = k;
            continue;
          }
        }
      }

      out.push(line);
    }
    text = out.join("\n");
  }

  // --- Remove Title Case section markers like "// Type Definitions" ---
  {
    const lines = text.split("\n");
    const out = [];
    for (const line of lines) {
      const m = line.match(/^(\s*)\/\/\s+(.+)$/);
      if (m) {
        const body = m[2].trim();
        // Title Case or ALL CAPS short section labels (not sentences)
        if (
          body.length <= 40 &&
          !/[.!?]$/.test(body) &&
          /^[A-Z][A-Za-z0-9 /-]*$/.test(body) &&
          !/\b(TODO|FIXME|HACK|NOTE|XXX|eslint|ts-|@ts)\b/i.test(body) &&
          body.split(/\s+/).length <= 5 &&
          !/[a-z]{4,}.*\s+(the|a|an|to|for|when|if|because)\s+/i.test(body)
        ) {
          // Heuristic: no lowercase connector words → section label
          if (!/\b(the|a|an|to|for|when|if|with|from|into|on|in|of)\b/i.test(body)) {
            changed = true;
            continue;
          }
        }
      }
      out.push(line);
    }
    text = out.join("\n");
  }

  // Collapse 2+ blank lines to 1
  const collapsed = text.replace(/\n{3,}/g, "\n\n");
  if (collapsed !== text) {
    text = collapsed;
    changed = true;
  }

  return { text, changed: changed && text !== source };
}

const targets =
  pathArgs.length > 0
    ? pathArgs.flatMap((p) => {
        const full = path.resolve(ROOT, p);
        if (fs.statSync(full).isDirectory()) return walk(full);
        return [full];
      })
    : ["aria/admin/composables", "aria/admin/features", "aria/lib", "aria/actions", "aria/tests", "src"].flatMap(
        (p) => walk(path.join(ROOT, p)),
      );

let modified = 0;
const touched = [];
for (const file of targets) {
  const source = fs.readFileSync(file, "utf8");
  const { text, changed } = transform(source, file);
  if (!changed || text === source) continue;
  modified++;
  touched.push(path.relative(ROOT, file));
  if (!DRY) fs.writeFileSync(file, text, "utf8");
}

console.log(`${DRY ? "[dry-run] " : ""}Modified ${modified} / ${targets.length} files`);
for (const t of touched.slice(0, 50)) console.log(`  ${t}`);
if (touched.length > 50) console.log(`  ... and ${touched.length - 50} more`);
