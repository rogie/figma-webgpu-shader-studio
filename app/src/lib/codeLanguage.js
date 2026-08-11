import { javascript } from "@codemirror/lang-javascript";
import { LanguageSupport } from "@codemirror/language";
import { parseMixed } from "@lezer/common";
import {
  wgsl,
  wgslLanguage,
} from "@iizukak/codemirror-lang-wgsl";

const WGSL_SIGNAL =
  /(?:@(?:binding|builtin|compute|fragment|group|location|vertex|workgroup_size)\b|\b(?:fn|struct)\s+\w+|\bvar\s*<(?:storage|uniform)>)/;

const typescriptSupport = javascript({ typescript: true, jsx: false });
const wgslSupport = wgsl();
const mixedLanguage = typescriptSupport.language.configure({
  wrap: parseMixed((node, input) => {
    if (node.name !== "TemplateString") return null;
    const content = input.read(node.from + 1, Math.max(node.from + 1, node.to - 1));
    // Leave interpolated templates to the TypeScript parser so expressions
    // inside ${...} retain correct JavaScript highlighting.
    if (content.includes("${") || !WGSL_SIGNAL.test(content)) return null;
    return {
      parser: wgslLanguage.parser,
      overlay: [{ from: node.from + 1, to: node.to - 1 }],
    };
  }),
});

export const figmaShaderLanguage = new LanguageSupport(mixedLanguage, [
  ...typescriptSupport.support,
  ...wgslSupport.support,
]);
