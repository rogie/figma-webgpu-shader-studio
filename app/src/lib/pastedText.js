// Figure out whether a paste is code, isolate the code from surrounding prose,
// and name the language so a PastedText card can title and highlight itself.

const FENCE_RE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\n`]*)$/;

/** Language ids we recognize, keyed to the label shown in "Pasted {label}". */
export const LANGUAGE_LABELS = {
  typescript: "typescript",
  tsx: "tsx",
  javascript: "javascript",
  jsx: "jsx",
  markdown: "markdown",
  json: "JSON",
  jsonc: "JSONC",
  wgsl: "WGSL",
  glsl: "GLSL",
  css: "CSS",
  html: "HTML",
  xml: "XML",
  yaml: "YAML",
  sql: "SQL",
  python: "python",
  ruby: "ruby",
  rust: "rust",
  go: "go",
  java: "java",
  kotlin: "kotlin",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  php: "php",
  lua: "lua",
  julia: "julia",
  elixir: "elixir",
  clojure: "clojure",
  pascal: "pascal",
  dockerfile: "Dockerfile",
  text: "text",
};

/** File extensions for language ids, without a leading dot. */
export const LANGUAGE_EXTENSIONS = {
  typescript: "ts",
  tsx: "tsx",
  javascript: "js",
  jsx: "jsx",
  markdown: "md",
  json: "json",
  jsonc: "jsonc",
  wgsl: "wgsl",
  glsl: "glsl",
  css: "css",
  html: "html",
  xml: "xml",
  yaml: "yml",
  sql: "sql",
  python: "py",
  ruby: "rb",
  rust: "rs",
  go: "go",
  java: "java",
  kotlin: "kt",
  csharp: "cs",
  cpp: "cpp",
  c: "c",
  php: "php",
  lua: "lua",
  julia: "jl",
  elixir: "ex",
  clojure: "clj",
  pascal: "pas",
  dockerfile: "dockerfile",
  text: "txt",
};

export function pastedExtension(languageId) {
  const extension = LANGUAGE_EXTENSIONS[languageId] || languageId || "txt";
  return extension.startsWith(".") ? extension : `${extension}`;
}

/** Fence hints (```ts) mapped onto our language ids. */
const FENCE_ALIASES = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  md: "markdown",
  markdown: "markdown",
  json: "json",
  jsonc: "jsonc",
  json5: "jsonc",
  wgsl: "wgsl",
  glsl: "glsl",
  frag: "glsl",
  vert: "glsl",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  xml: "xml",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  sql: "sql",
  py: "python",
  python: "python",
  rb: "ruby",
  ruby: "ruby",
  rs: "rust",
  rust: "rust",
  go: "go",
  golang: "go",
  java: "java",
  kt: "kotlin",
  kotlin: "kotlin",
  cs: "csharp",
  csharp: "csharp",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  c: "c",
  php: "php",
  lua: "lua",
  julia: "julia",
  ex: "elixir",
  elixir: "elixir",
  clj: "clojure",
  clojure: "clojure",
  pascal: "pascal",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  txt: "text",
  text: "text",
  plaintext: "text",
};

/** flourite's shiki ids mapped onto our language ids. */
const FLOURITE_ALIASES = {
  typescript: "typescript",
  javascript: "javascript",
  markdown: "markdown",
  json: "json",
  css: "css",
  html: "html",
  yaml: "yaml",
  sql: "sql",
  python: "python",
  ruby: "ruby",
  rust: "rust",
  go: "go",
  java: "java",
  kotlin: "kotlin",
  csharp: "csharp",
  cpp: "cpp",
  c: "c",
  php: "php",
  lua: "lua",
  julia: "julia",
  elixir: "elixir",
  clojure: "clojure",
  pascal: "pascal",
  dockerfile: "dockerfile",
};

const WGSL_SIGNALS = [
  /@(?:fragment|vertex|compute|group|binding|builtin|location|workgroup_size)\b/,
  /\bvar\s*<\s*(?:uniform|storage|workgroup)/,
  /\bfn\s+\w+\s*\([^)]*\)\s*(?:->\s*[\w<>,\s]+)?\{/,
  /\b(?:vec[234]f|vec[234]<[fiu]32>|f32|u32|i32|mat[234]x[234]f)\b/,
  /\btextureSample\w*\s*\(/,
];

const GLSL_SIGNALS = [
  /^\s*#version\s+\d+/m,
  /\bprecision\s+(?:lowp|mediump|highp)\s+(?:float|int)\s*;/,
  /\bgl_(?:Position|FragColor|FragCoord|PointSize)\b/,
  /\b(?:sampler2D|samplerCube|texture2D|textureLod)\b/,
  /^\s*(?:uniform|attribute|varying)\s+\w+\s+\w+\s*;/m,
  /\bvoid\s+main\s*\(\s*\)\s*\{/,
];

/**
 * Score how strongly a single line reads as code rather than prose.
 * Signals follow the structural features used by text classifiers: symbol
 * density, sentence punctuation, indentation, and code-only operators.
 * @param {string} line
 * @returns {number} roughly -1 (prose) to 1 (code)
 */
export function scoreLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  // "Do this:" is too short for a colon to mean a typed field.
  if (isInstructionPrefix(trimmed)) return -0.5;

  let score = 0;

  const symbols = (trimmed.match(/[{}[\]()<>;=+\-*/%&|^~!?:@#$\\`,]/g) || [])
    .length;
  const symbolRatio = symbols / trimmed.length;
  if (symbolRatio > 0.25) score += 0.5;
  else if (symbolRatio > 0.12) score += 0.3;
  else if (symbolRatio < 0.03) score -= 0.3;

  // A markdown heading also starts with #, so check it before comment markers.
  if (/^#{1,6}\s+\S/.test(trimmed) && !/[;{}=()]/.test(trimmed)) return -0.6;
  if (/^\s*(?:[-*+]|\d+\.)\s+[A-Za-z]/.test(line) && !/[;{}=]/.test(trimmed)) {
    return -0.4;
  }

  if (/[;{}]\s*$/.test(trimmed)) score += 0.4;
  if (/^[}\])]/.test(trimmed)) score += 0.4;
  if (/^(?:\/\/|\/\*|\*|#|--)/.test(trimmed)) score += 0.3;
  if (/^(?:import|export|from|require|package|using|#include|#version)\b/.test(trimmed)) {
    score += 0.6;
  }
  // Only count language keywords as code when they start a statement. English
  // like "change the clamp function to" should not inherit that bonus.
  if (
    /^(?:(?:export|default|async|public|private|static|protected)\s+)*(?:function|const|let|var|class|interface|type|enum|struct|def|fn|func|void|impl|trait)\b/.test(
      trimmed
    )
  ) {
    score += 0.4;
  } else if (
    /\b(?:return|if|else|for|while|switch|case|try|catch|throw|await|async)\b/.test(trimmed) &&
    /[;{}()]/.test(trimmed)
  ) {
    score += 0.4;
  }
  if (/(?:=>|->|::|\?\?|\|\||&&|\+\+|--|===|!==|<=|>=)/.test(trimmed)) {
    score += 0.3;
  }
  if (/\w+\s*\([^)]*\)/.test(trimmed)) score += 0.25;
  if (/^\s*[\w"'-]+\s*[:=]\s*\S/.test(trimmed)) score += 0.2;
  if (/^\s*[\w$]+\s*:\s*[\[{]/.test(trimmed)) score += 0.35;
  // Wrapped call arguments: `gl.TEXTURE_2D,` / `gl.texParameteri(`
  if (/,\s*$/.test(trimmed)) score += 0.3;
  if (/\b[\w$]+\.[\w$]+/.test(trimmed)) score += 0.25;
  if (/\w+\s*\(\s*$/.test(trimmed)) score += 0.25;
  if (/[a-z][A-Z]|_[a-z]/.test(trimmed)) score += 0.15;
  if (/^\s{2,}|^\t/.test(line)) score += 0.2;

  // Prose signals. Numeric tokens in `ascii: [0, 128, …]` are not English words.
  const alphaWords = trimmed.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
  if (/[.!?]["')]?$/.test(trimmed) && !/[;{}]/.test(trimmed)) score -= 0.35;
  if (alphaWords.length > 6 && symbolRatio < 0.06) score -= 0.4;
  if (/^(?:the|this|a|an|we|i|you|it|here|there|and|but|so|if you|note|however)\b/i.test(trimmed)) {
    score -= 0.3;
  }

  return Math.max(-1, Math.min(1, score));
}

/** Short "Do this:" leads. A colon on a tiny line looks like a high symbol ratio. */
function isInstructionPrefix(prefix) {
  const trimmed = prefix.trim();
  if (!/:\s*$/.test(trimmed)) return false;
  if (/[;{}()=]/.test(trimmed)) return false;
  if (
    /\b(?:export|import|function|const|let|var|class|interface|type|enum)\b/.test(
      trimmed
    )
  ) {
    return false;
  }
  const alphaWords = trimmed.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
  return alphaWords.length >= 2 && alphaWords.length <= 16;
}

function makeSegment(kind, lines, startLine, fenceHint) {
  const text = lines.join("\n");
  const scores = lines.filter((line) => line.trim()).map(scoreLine);
  const codeScore = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : 0;
  return {
    kind,
    text,
    startLine,
    endLine: startLine + lines.length - 1,
    lineCount: lines.length,
    fenceHint: fenceHint || null,
    codeScore: kind === "code" && fenceHint != null ? Math.max(codeScore, 0.6) : codeScore,
  };
}

/**
 * Split pasted text into ordered prose and code segments.
 * Fenced blocks win outright; everything else is classified by line scoring.
 * @param {string} input
 * @returns {Array<{kind: "code"|"prose", text: string, startLine: number, endLine: number, lineCount: number, fenceHint: string|null, codeScore: number}>}
 */
export function segmentPaste(input) {
  const text = String(input ?? "");
  if (!text.trim()) return [];

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const segments = [];
  // Fences are an explicit statement about where the code is, so when they are
  // present everything outside them is prose no matter how it scores.
  const fenced = hasFencedBlock(lines);
  let buffer = [];
  let bufferStart = 0;

  const flushBuffer = () => {
    if (!buffer.length) return;
    if (fenced) {
      if (buffer.some((line) => line.trim())) {
        segments.push(makeSegment("prose", buffer, bufferStart, null));
      }
    } else {
      segments.push(...classifyPlainLines(buffer, bufferStart));
    }
    buffer = [];
  };

  for (let index = 0; index < lines.length; index++) {
    const fence = lines[index].match(FENCE_RE);
    if (!fence) {
      if (!buffer.length) bufferStart = index;
      buffer.push(...expandInlineSplit(lines[index]));
      continue;
    }

    const marker = fence[2];
    const hint = normalizeFenceHint(fence[3]);
    let close = -1;
    for (let scan = index + 1; scan < lines.length; scan++) {
      const candidate = lines[scan].match(FENCE_RE);
      if (candidate && candidate[2].startsWith(marker[0]) && !candidate[3].trim()) {
        close = scan;
        break;
      }
    }

    flushBuffer();
    const bodyEnd = close === -1 ? lines.length : close;
    const body = lines.slice(index + 1, bodyEnd);
    if (body.some((line) => line.trim())) {
      segments.push(makeSegment("code", body, index + 1, hint ?? ""));
    }
    index = close === -1 ? lines.length : close;
  }

  flushBuffer();
  return segments;
}

/** True when the lines contain at least one opened and closed fence. */
function hasFencedBlock(lines) {
  for (let index = 0; index < lines.length; index++) {
    const open = lines[index].match(FENCE_RE);
    if (!open) continue;
    for (let scan = index + 1; scan < lines.length; scan++) {
      const close = lines[scan].match(FENCE_RE);
      if (close && close[2].startsWith(open[2][0]) && !close[3].trim()) return true;
    }
  }
  return false;
}

/**
 * Host-language declarations that can start after a human lead-in.
 * `function to` in English must not match; `function clamp(` must.
 */
const HOST_INLINE_HEADS = [
  /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/,
  /(?:export\s+)?(?:default\s+)?(?:class|interface|enum)\s+[A-Za-z_$][\w$]*/,
  /(?:export\s+)?type\s+[A-Za-z_$][\w$]*\s*[=<]/,
  /(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*[=:]/,
  /(?:import|export)\s+(?:type\s+)?[{\w*]/,
];

/**
 * Comment markers that often open a pasted snippet after a short instruction.
 * `//` must not fire inside URLs (`https://…`).
 */
const COMMENT_INLINE_HEADS = [/(?<!:)\/\//, /\/\*/];

/**
 * GLSL / WGSL heads strong enough to cut a same-line instruction.
 * Prefer structured forms over bare reserved words so English like
 * "more uniform lighting" or "in float terms" does not split.
 */
const GLSL_TYPE =
  "(?:float|int|bool|double|void|vec[234]|[iu]vec[234]|mat[234](?:x[234])?|sampler\\w*)";
const SHADER_INLINE_HEADS = [
  // GLSL preprocessor / precision
  /#version\s+\d+/,
  /#extension\s+[A-Za-z_]\w*/,
  /precision\s+(?:lowp|mediump|highp)\b/,
  /(?:lowp|mediump|highp)\s+(?:float|int|vec[234]|mat[234]|sampler\w*)\b/,
  // Classic and modern GLSL declarations (type required after the keyword)
  new RegExp(
    `(?:uniform|attribute|varying)\\s+(?:(?:lowp|mediump|highp)\\s+)?${GLSL_TYPE}\\s+[A-Za-z_]\\w*`
  ),
  new RegExp(
    `(?:in|out)\\s+(?:(?:lowp|mediump|highp)\\s+)?(?:vec[234]|[iu]vec[234]|mat[234](?:x[234])?)\\s+[A-Za-z_]\\w*`
  ),
  /layout\s*\(/,
  /void\s+main\s*\(/,
  // WGSL attributes, address spaces, and declaration heads
  /@(?:fragment|vertex|compute|group|binding|builtin|location|workgroup_size)\b/,
  /var\s*<\s*(?:uniform|storage|workgroup|private|function)\b/,
  /fn\s+[A-Za-z_]\w*\s*\(/,
  /struct\s+[A-Za-z_]\w*\s*\{/,
  /(?:enable|requires)\s+[a-z][\w-]*/,
  /(?:alias|override)\s+[A-Za-z_]\w*/,
];

const INLINE_CODE_HEAD = new RegExp(
  [...HOST_INLINE_HEADS, ...COMMENT_INLINE_HEADS, ...SHADER_INLINE_HEADS]
    .map((re) => `(?:${re.source})`)
    .join("|")
);

/**
 * Split "Change the clamp function to: export function clamp(…" into prose
 * plus a code line. Returns one or two lines for the classifier.
 */
function expandInlineSplit(line) {
  const start = line.search(/\S/);
  if (start < 0) return [line];
  const match = line.slice(start).match(INLINE_CODE_HEAD);
  if (!match || match.index === 0) return [line];

  const cut = start + match.index;
  const prefix = line.slice(0, cut);
  const trimmedPrefix = prefix.trim();
  if (trimmedPrefix.length < 7) return [line];
  if (scoreLine(trimmedPrefix) >= 0.25 && !isInstructionPrefix(trimmedPrefix)) {
    return [line];
  }
  const alphaWords = trimmedPrefix.split(/\s+/).filter((word) => /[A-Za-z]{2,}/.test(word));
  if (alphaWords.length < 2) return [line];
  if (/[=<([]\s*$/.test(trimmedPrefix)) return [line];

  return [prefix.replace(/\s+$/, ""), line.slice(cut)];
}

function normalizeFenceHint(raw) {
  const token = String(raw || "")
    .trim()
    .split(/[\s,{]/)[0]
    .toLowerCase();
  if (!token) return null;
  return FENCE_ALIASES[token] || null;
}

/** Group unfenced lines into code and prose runs using per-line scores. */
function classifyPlainLines(lines, offset) {
  const flags = lines.map((line) => {
    if (!line.trim()) return null;
    return scoreLine(line) >= 0.25;
  });

  // Blank lines inherit their neighbors so a code block is not split apart.
  for (let index = 0; index < flags.length; index++) {
    if (flags[index] !== null) continue;
    const before = findNearest(flags, index, -1);
    const after = findNearest(flags, index, 1);
    flags[index] = before === true && after === true ? true : before ?? after ?? false;
  }

  // Absorb isolated prose lines that sit inside a code run (comments, labels).
  for (let index = 1; index < flags.length - 1; index++) {
    if (!flags[index] && flags[index - 1] && flags[index + 1]) flags[index] = true;
  }

  // Absorb short code-shaped gaps (object properties, array rows) between code.
  for (let index = 0; index < flags.length; ) {
    if (flags[index]) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < flags.length && !flags[end]) end += 1;
    const before = index > 0 && flags[index - 1];
    const after = end < flags.length && flags[end];
    const run = lines.slice(index, end);
    const codeShaped = run.every(
      (line) =>
        !line.trim() ||
        /[[\]{};]/.test(line) ||
        /^\s*[\w$."']+\s*[:=]/.test(line) ||
        /,\s*$/.test(line.trim()) ||
        /\b[\w$]+\.[\w$]+/.test(line) ||
        /^\s*[\w$.]+(?:\s*,\s*[\w$.]+)+\s*,?\s*$/.test(line)
    );
    if (before && after && codeShaped && end - index <= 8) {
      for (let cursor = index; cursor < end; cursor += 1) flags[cursor] = true;
    }
    index = end;
  }

  const segments = [];
  let runStart = 0;
  for (let index = 1; index <= flags.length; index++) {
    if (index < flags.length && flags[index] === flags[runStart]) continue;
    const run = lines.slice(runStart, index);
    if (run.some((line) => line.trim())) {
      segments.push(
        makeSegment(flags[runStart] ? "code" : "prose", run, offset + runStart, null)
      );
    }
    runStart = index;
  }
  return segments;
}

function findNearest(flags, from, step) {
  for (let index = from + step; index >= 0 && index < flags.length; index += step) {
    if (flags[index] !== null) return flags[index];
  }
  return null;
}

function matchCount(code, signals) {
  return signals.reduce((count, pattern) => count + (pattern.test(code) ? 1 : 0), 0);
}

function looksLikeJson(code) {
  const trimmed = code.trim();
  if (!/^[[{]/.test(trimmed) || !/[\]}]$/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function looksLikeJsonc(code) {
  const trimmed = code.trim();
  if (!/^[[{]/.test(trimmed) || !/[\]}]$/.test(trimmed)) return false;
  const stripped = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    JSON.parse(stripped);
    return true;
  } catch {
    return false;
  }
}

/** Host-language or shader markers that should never be called markdown. */
function looksLikeSourceModule(text) {
  return /(?:\bexport\s+(?:type|interface|function|const|class|enum|default|async)\b|\bimport\s+(?:type\s+)?(?:\{|[\w*"'])|\bfunction\s+\w+\s*\(|^\s*#version\s+\d+|\b@(?:fragment|vertex|compute|group|binding)\b)/m.test(
    text
  );
}

/** A markdown list item, not a GLSL continuation (`* clamp(`) or JSDoc (`* foo`). */
function isMarkdownListItem(line) {
  const match = line.match(/^\s*(?:[-+]|\d+\.|(\*))\s+(\S.*)$/);
  if (!match) return false;
  const body = match[2];
  // Code continuations and JSDoc bullets are `* identifier(` or `* 0.5`.
  if (match[1] && /^[\w$.(]/.test(body) && /[;{}=()]/.test(body)) return false;
  if (/[;{}=]/.test(body)) return false;
  return /^[A-Za-z]/.test(body);
}

function looksLikeMarkdown(text) {
  // Judge the document around fences, not the fenced source. A TS module
  // pasted whole has no fences, so host-language markers still veto markdown.
  const body = String(text || "").replace(
    /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm,
    ""
  );
  if (looksLikeSourceModule(body)) return false;

  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let hits = 0;
  let fences = 0;
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) hits += 2;
    else if (isMarkdownListItem(line)) hits += 1;
    else if (/^\s*>\s+\S/.test(line)) hits += 1;
    else if (/^\s*(?:```|~~~)/.test(line)) fences += 1;
    else if (/^\s*(?:\|.*\|)\s*$/.test(line)) hits += 1;
    else if (/\[[^\]]+\]\([^)]+\)/.test(line)) hits += 1;
    else if (/(^|[^/])(\*\*|__)[A-Za-z][\s\S]*?\2/.test(line)) hits += 1;
  }
  // A single fence is just prose wrapped around a snippet, not a document, so
  // fences only reinforce markdown once other structure is present.
  if (fences >= 2) hits += 1;
  if (fences >= 4) hits += 1;
  return hits >= 3;
}

/** Mean line score, used to gate guessing a language for plain prose. */
export function codeness(text) {
  const lines = String(text || "")
    .split("\n")
    .filter((line) => line.trim());
  if (!lines.length) return 0;
  return lines.reduce((sum, line) => sum + scoreLine(line), 0) / lines.length;
}

/** Detect an embedded shader language inside TS/JS template literals. */
function detectNested(code) {
  const nested = [];
  const templates = code.match(/`[^`]{40,}`/g) || [];
  for (const template of templates) {
    if (matchCount(template, WGSL_SIGNALS) >= 2 && !nested.includes("wgsl")) {
      nested.push("wgsl");
    } else if (matchCount(template, GLSL_SIGNALS) >= 2 && !nested.includes("glsl")) {
      nested.push("glsl");
    }
  }
  return nested;
}

/** Rules for languages flourite does not know about. */
function detectLocal(code) {
  const wgsl = matchCount(code, WGSL_SIGNALS);
  const glsl = matchCount(code, GLSL_SIGNALS);
  // `let`, `const`, and `var` are also WGSL keywords, so only host-language
  // markers that shaders never use can rule a shader out.
  const isModule = /(?:\bimport\b|\bexport\b|\brequire\b|\bfunction\b|\bclass\b|\binterface\b|=>)/.test(
    code
  );

  if (!isModule && glsl >= 2 && glsl >= wgsl) {
    return { id: "glsl", confidence: 0.9 };
  }
  if (!isModule && wgsl >= 2) {
    return { id: "wgsl", confidence: 0.9 };
  }
  if (looksLikeJson(code)) return { id: "json", confidence: 1 };
  if (looksLikeJsonc(code)) return { id: "jsonc", confidence: 0.8 };
  if (
    /\bexport\s+(?:type|interface|function|const|class|enum|default)\b/.test(code) ||
    /\bimport\s+(?:type\s+)?(?:\{|[\w*"'])/.test(code)
  ) {
    return { id: "typescript", confidence: 0.85 };
  }
  return null;
}

async function runFlourite(code) {
  try {
    const module = await import("flourite");
    const flourite = module.default || module;
    const result = flourite(code, { shiki: true });
    const id = FLOURITE_ALIASES[result?.language] || null;
    const stats = result?.statistics || {};
    const ranked = Object.entries(stats)
      .filter(([name]) => name !== "Unknown")
      .sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[1] || 0;
    const runnerUp = ranked[1]?.[1] || 0;
    const confidence = top > 0 ? Math.min(0.85, 0.4 + (top - runnerUp) / (top * 2)) : 0.2;
    return { id, confidence, statistics: ranked.slice(0, 5) };
  } catch {
    return { id: null, confidence: 0, statistics: [] };
  }
}

/**
 * Name the language of a code string.
 * @param {string} code
 * @param {{ fenceHint?: string|null }} [options]
 * @returns {Promise<{id: string, label: string, confidence: number, source: string, nested: string[], statistics: Array<[string, number]>}>}
 */
export async function detectLanguage(code, options = {}) {
  const text = String(code || "");
  const nested = detectNested(text);

  const finish = (id, confidence, source, statistics = []) => ({
    id,
    label: LANGUAGE_LABELS[id] || id,
    confidence,
    source,
    nested,
    statistics,
  });

  if (!text.trim()) return finish("text", 0, "empty");

  const hint = options.fenceHint ? FENCE_ALIASES[options.fenceHint] || null : null;
  if (hint) return finish(hint, 0.95, "fence");

  const local = detectLocal(text);
  if (local) return finish(local.id, local.confidence, "local");

  if (looksLikeMarkdown(text)) return finish("markdown", 0.7, "local");

  // flourite always names some language, so plain prose would come back as
  // TypeScript or Ruby. Only ask it once the text reads as code at all.
  if (codeness(text) < 0.15) return finish("text", 0.3, "prose");

  const guess = await runFlourite(text);
  if (guess.id) return finish(guess.id, guess.confidence, "flourite", guess.statistics);

  return finish("text", 0.2, "fallback", guess.statistics);
}

/** Title shown in the PastedText header. */
export function pastedTitle(languageId) {
  return `Pasted ${LANGUAGE_LABELS[languageId] || languageId || "text"}`;
}

/** Pull plain text out of a clipboard text/html flavor, preferring code nodes. */
export function textFromHtml(html) {
  if (!html || typeof DOMParser === "undefined") return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const blocks = Array.from(doc.querySelectorAll("pre, code"));
    const scoped = blocks.filter(
      (node) => !blocks.some((other) => other !== node && other.contains(node))
    );
    const source = scoped.length ? scoped : [doc.body];
    return source
      .map((node) => node.textContent || "")
      .join("\n\n")
      .replace(/\u00a0/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function buildCandidate(id, title, text, language, reason, extras = {}) {
  const trimmed = text.replace(/\s+$/, "");
  return {
    id,
    title,
    text: trimmed,
    language: language.id,
    label: language.label,
    nested: language.nested,
    detectionSource: language.source,
    confidence: language.confidence,
    statistics: language.statistics || [],
    lineCount: trimmed ? trimmed.split("\n").length : 0,
    charCount: trimmed.length,
    reason,
    ...extras,
  };
}

/**
 * Analyze a paste into every interpretation we can perceive, and pick the best.
 * @param {{ text?: string, html?: string, types?: string[] }} payload
 */
export async function analyzePaste(payload = {}) {
  const text = String(payload.text ?? "");
  const html = String(payload.html ?? "");
  const segments = segmentPaste(text);
  const codeSegments = segments.filter((segment) => segment.kind === "code");
  const totalLines = text.trim() ? text.replace(/\r\n?/g, "\n").split("\n").length : 0;
  const codeLines = codeSegments.reduce((sum, segment) => sum + segment.lineCount, 0);
  const coverage = totalLines ? codeLines / totalLines : 0;

  const candidates = [];

  // Naming a language for a paste that is mostly prose would be a guess about
  // the minority of its lines, so mixed pastes stay plain text when read whole.
  const rawLanguage =
    coverage >= 0.85 || looksLikeMarkdown(text)
      ? await detectLanguage(text)
      : {
          id: "text",
          label: LANGUAGE_LABELS.text,
          confidence: 0.3,
          source: "mixed",
          nested: [],
          statistics: [],
        };
  candidates.push(
    buildCandidate("raw", pastedTitle(rawLanguage.id), text, rawLanguage, "Whole clipboard text, unmodified.", {
      coverage: 1,
      codeScore: null,
    })
  );

  if (looksLikeMarkdown(text)) {
    const markdownLanguage = {
      id: "markdown",
      label: LANGUAGE_LABELS.markdown,
      confidence: 0.8,
      source: "local",
      nested: [],
      statistics: [],
    };
    candidates.push(
      buildCandidate(
        "markdown",
        pastedTitle("markdown"),
        text,
        markdownLanguage,
        "Headings, lists, or fences dominate, so the paste reads as a document.",
        { coverage: 1, codeScore: null }
      )
    );
  }

  if (codeSegments.length) {
    const joined = codeSegments.map((segment) => segment.text).join("\n\n");
    const hint = codeSegments.find((segment) => segment.fenceHint)?.fenceHint || null;
    const codeLanguage = await detectLanguage(joined, { fenceHint: hint });
    candidates.push(
      buildCandidate(
        "code",
        pastedTitle(codeLanguage.id),
        joined,
        codeLanguage,
        codeSegments.length > 1
          ? `Prose stripped; ${codeSegments.length} code segments joined.`
          : "Prose stripped; the single code segment kept.",
        { coverage, codeScore: averageScore(codeSegments) }
      )
    );

    const largest = codeSegments.reduce((best, segment) =>
      segment.lineCount > best.lineCount ? segment : best
    );
    if (codeSegments.length > 1) {
      const largestLanguage = await detectLanguage(largest.text, {
        fenceHint: largest.fenceHint,
      });
      candidates.push(
        buildCandidate(
          "code-first",
          pastedTitle(largestLanguage.id),
          largest.text,
          largestLanguage,
          `Only the largest code segment (lines ${largest.startLine + 1}-${largest.endLine + 1}).`,
          { coverage: largest.lineCount / Math.max(totalLines, 1), codeScore: largest.codeScore }
        )
      );
    }
  }

  const htmlText = textFromHtml(html);
  if (htmlText && htmlText !== text.trim()) {
    const htmlLanguage = await detectLanguage(htmlText);
    candidates.push(
      buildCandidate(
        "html-text",
        pastedTitle(htmlLanguage.id),
        htmlText,
        htmlLanguage,
        "Text pulled from the clipboard's text/html pre and code nodes.",
        { coverage: 1, codeScore: null }
      )
    );
  }

  const best = pickBest(candidates, coverage);

  return {
    flavors: {
      types: payload.types || [],
      hasText: Boolean(text),
      hasHtml: Boolean(html),
      textLength: text.length,
      htmlLength: html.length,
    },
    segments,
    candidates,
    best,
    coverage,
  };
}

function averageScore(segments) {
  if (!segments.length) return 0;
  const weighted = segments.reduce(
    (sum, segment) => sum + segment.codeScore * segment.lineCount,
    0
  );
  const lines = segments.reduce((sum, segment) => sum + segment.lineCount, 0);
  return lines ? weighted / lines : 0;
}

function pickBest(candidates, coverage) {
  if (!candidates.length) return null;
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const markdown = byId.get("markdown");
  const code = byId.get("code");

  // A markdown document should stay whole; stripping prose loses its meaning.
  if (markdown && (!code || coverage < 0.85)) return markdown;
  if (code && coverage < 0.999) return code;
  if (code) return code;
  return byId.get("raw") || candidates[0];
}

function toPastePayload(candidate) {
  return {
    text: candidate.text,
    language: candidate.language,
    label: candidate.label,
    nested: candidate.nested || [],
    title: candidate.title,
  };
}

/**
 * Split a composer draft into chat prose plus PastedText attachments.
 * Code and markdown documents become pastes; remaining prose stays as the
 * user message, the same way images are pulled out of a paste.
 * @param {{ text?: string, html?: string, types?: string[] }} payload
 */
export async function splitComposerPaste(payload = {}) {
  const analysis = await analyzePaste(payload);
  const byId = new Map(
    (analysis.candidates || []).map((candidate) => [candidate.id, candidate])
  );
  const best = analysis.best;
  const code = byId.get("code");
  const markdown = byId.get("markdown");

  if (markdown && best?.id === "markdown") {
    return { content: "", pastes: [toPastePayload(markdown)], analysis };
  }

  if (code && code.language !== "text") {
    const content = analysis.segments
      .filter((segment) => segment.kind === "prose")
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join("\n\n");
    return { content, pastes: [toPastePayload(code)], analysis };
  }

  const text = String(payload.text ?? "").trim();
  return { content: text, pastes: [], analysis };
}
