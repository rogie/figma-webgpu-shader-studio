import { LanguageSupport } from "@codemirror/language";
import { parseMixed } from "@lezer/common";
import { classHighlighter, highlightTree } from "@lezer/highlight";

// Language packages are dynamically imported so only the grammars a paste
// actually needs get downloaded, keeping them out of the entry chunk.
const LOADERS = {
  typescript: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ typescript: true });
  },
  tsx: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ typescript: true, jsx: true });
  },
  javascript: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript();
  },
  jsx: async () => {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ jsx: true });
  },
  wgsl: async () => {
    const { wgsl } = await import("@iizukak/codemirror-lang-wgsl");
    return wgsl();
  },
  // No dedicated GLSL grammar exists for CodeMirror 6; C++ is the closest fit.
  glsl: async () => {
    const { cpp } = await import("@codemirror/lang-cpp");
    return cpp();
  },
  markdown: async () => {
    const { markdown } = await import("@codemirror/lang-markdown");
    return markdown();
  },
  json: async () => {
    const { json } = await import("@codemirror/lang-json");
    return json();
  },
  jsonc: async () => {
    const { json } = await import("@codemirror/lang-json");
    return json();
  },
  css: async () => {
    const { css } = await import("@codemirror/lang-css");
    return css();
  },
  html: async () => {
    const { html } = await import("@codemirror/lang-html");
    return html();
  },
  xml: async () => {
    const { xml } = await import("@codemirror/lang-xml");
    return xml();
  },
  yaml: async () => {
    const { yaml } = await import("@codemirror/lang-yaml");
    return yaml();
  },
  sql: async () => {
    const { sql } = await import("@codemirror/lang-sql");
    return sql();
  },
  python: async () => {
    const { python } = await import("@codemirror/lang-python");
    return python();
  },
  rust: async () => {
    const { rust } = await import("@codemirror/lang-rust");
    return rust();
  },
  cpp: async () => {
    const { cpp } = await import("@codemirror/lang-cpp");
    return cpp();
  },
  c: async () => {
    const { cpp } = await import("@codemirror/lang-cpp");
    return cpp();
  },
  java: async () => {
    const { java } = await import("@codemirror/lang-java");
    return java();
  },
  kotlin: async () => {
    const { java } = await import("@codemirror/lang-java");
    return java();
  },
  go: async () => {
    const { go } = await import("@codemirror/lang-go");
    return go();
  },
  php: async () => {
    const { php } = await import("@codemirror/lang-php");
    return php();
  },
};

/** Package each language id resolves to, for playground debugging. */
export const LANGUAGE_PACKAGES = {
  typescript: "@codemirror/lang-javascript",
  tsx: "@codemirror/lang-javascript",
  javascript: "@codemirror/lang-javascript",
  jsx: "@codemirror/lang-javascript",
  wgsl: "@iizukak/codemirror-lang-wgsl",
  glsl: "@codemirror/lang-cpp",
  markdown: "@codemirror/lang-markdown",
  json: "@codemirror/lang-json",
  jsonc: "@codemirror/lang-json",
  css: "@codemirror/lang-css",
  html: "@codemirror/lang-html",
  xml: "@codemirror/lang-xml",
  yaml: "@codemirror/lang-yaml",
  sql: "@codemirror/lang-sql",
  python: "@codemirror/lang-python",
  rust: "@codemirror/lang-rust",
  cpp: "@codemirror/lang-cpp",
  c: "@codemirror/lang-cpp",
  java: "@codemirror/lang-java",
  kotlin: "@codemirror/lang-java",
  go: "@codemirror/lang-go",
  php: "@codemirror/lang-php",
};

const SHADER_SIGNAL =
  /(?:@(?:binding|builtin|compute|fragment|group|location|vertex|workgroup_size)\b|\b(?:fn|struct)\s+\w+|\bvar\s*<(?:storage|uniform)>|^\s*#version\s+\d+|\bgl_(?:Position|FragColor|FragCoord)\b|\bprecision\s+(?:lowp|mediump|highp)\b)/m;

const cache = new Map();

/**
 * Overlay a shader grammar onto template literals inside a TS/JS module, the
 * same trick the editor uses for `/* wgsl *\/` tagged strings.
 */
async function withNestedShader(base, nestedId) {
  const nestedSupport = await LOADERS[nestedId]?.();
  if (!nestedSupport) return base;
  const nestedParser = nestedSupport.language.parser;
  const mixed = base.language.configure({
    wrap: parseMixed((node, input) => {
      if (node.name !== "TemplateString") return null;
      const from = node.from + 1;
      const to = Math.max(from, node.to - 1);
      const content = input.read(from, to);
      if (content.includes("${") || !SHADER_SIGNAL.test(content)) return null;
      return { parser: nestedParser, overlay: [{ from, to }] };
    }),
  });
  return new LanguageSupport(mixed, [...base.support, ...nestedSupport.support]);
}

/** True when this language has a CodeMirror grammar, including markdown. */
export function hasLanguageSupport(languageId) {
  return Boolean(LOADERS[languageId]);
}

/**
 * Resolve a detected language id to a CodeMirror LanguageSupport.
 * @param {string} languageId
 * @param {{ nested?: string[] }} [options]
 * @returns {Promise<import("@codemirror/language").LanguageSupport|null>}
 */
export async function loadLanguageSupport(languageId, options = {}) {
  const loader = LOADERS[languageId];
  if (!loader) return null;

  const nestedId = (options.nested || []).find((id) => id === "wgsl" || id === "glsl");
  const key = nestedId ? `${languageId}+${nestedId}` : languageId;
  if (cache.has(key)) return cache.get(key);

  const pending = (async () => {
    const base = await loader();
    if (!nestedId || !/^(?:typescript|tsx|javascript|jsx)$/.test(languageId)) {
      return base;
    }
    return withNestedShader(base, nestedId);
  })();

  cache.set(key, pending);
  return pending;
}

/**
 * Tokenize source with the same `tok-*` classHighlighter StreamingCodeBlock uses.
 * @param {string} source
 * @param {import("@codemirror/language").LanguageSupport|null} languageSupport
 * @returns {Array<{from: number, to: number, classes: string, text: string}>}
 */
export function highlightRanges(source, languageSupport) {
  const text = String(source ?? "");
  if (!text) return [];
  if (!languageSupport?.language?.parser) {
    return [{ from: 0, to: text.length, classes: "", text }];
  }

  const tree = languageSupport.language.parser.parse(text);
  const ranges = [];
  let cursor = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > cursor) {
      ranges.push({
        from: cursor,
        to: from,
        classes: "",
        text: text.slice(cursor, from),
      });
    }
    ranges.push({
      from,
      to,
      classes,
      text: text.slice(from, to),
    });
    cursor = to;
  });
  if (cursor < text.length) {
    ranges.push({
      from: cursor,
      to: text.length,
      classes: "",
      text: text.slice(cursor),
    });
  }
  return ranges;
}
