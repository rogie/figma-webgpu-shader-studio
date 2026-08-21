const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const NUMBER_RE =
  /^[+-]?(?:0x[0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;

function isIdentChar(char) {
  return IDENT_PART.test(char || "");
}

function skipLineComment(source, index) {
  const end = source.indexOf("\n", index);
  return end < 0 ? source.length : end;
}

function skipBlockComment(source, index) {
  const end = source.indexOf("*/", index + 2);
  return end < 0 ? source.length : end + 2;
}

export function skipTrivia(source, index) {
  let i = index;
  while (i < source.length) {
    const char = source[i];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      i += 1;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    break;
  }
  return i;
}

function scanString(source, index) {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return source.length;
}

function scanBalanced(source, start, open, close) {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === "'" || char === '"') {
      i = scanString(source, i);
      continue;
    }
    if (char === "`") {
      i = scanTemplate(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  throw new Error(`Unbalanced ${open}${close} in shader source.`);
}

function scanTemplate(source, index) {
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === "`") return i + 1;
    if (source[i] === "$" && source[i + 1] === "{") {
      i = scanBalanced(source, i + 1, "{", "}");
      continue;
    }
    i += 1;
  }
  return source.length;
}

function scanValue(source, start) {
  const i = skipTrivia(source, start);
  const char = source[i];
  if (char === "'" || char === '"') return scanString(source, i);
  if (char === "`") return scanTemplate(source, i);
  if (char === "{") return scanBalanced(source, i, "{", "}");
  if (char === "[") return scanBalanced(source, i, "[", "]");
  if (char === "(") return scanBalanced(source, i, "(", ")");
  const number = source.slice(i).match(NUMBER_RE);
  if (number) return i + number[0].length;
  if (IDENT_START.test(char || "")) {
    let j = i + 1;
    while (j < source.length && isIdentChar(source[j])) j += 1;
    return j;
  }
  return i + 1;
}

function readIdent(source, start) {
  if (!IDENT_START.test(source[start] || "")) return null;
  let i = start + 1;
  while (i < source.length && isIdentChar(source[i])) i += 1;
  return { value: source.slice(start, i), end: i };
}

function unquote(text) {
  const quote = text[0];
  if ((quote !== "'" && quote !== '"') || text[text.length - 1] !== quote) {
    return text;
  }
  let out = "";
  for (let i = 1; i < text.length - 1; i += 1) {
    if (text[i] === "\\" && i + 1 < text.length - 1) {
      out += text[i + 1];
      i += 1;
      continue;
    }
    out += text[i];
  }
  return out;
}

function readObjectEntries(source, from, to) {
  const entries = [];
  let i = skipTrivia(source, from + 1);
  while (i < to - 1) {
    if (source[i] === "}") break;
    if (source[i] === ",") {
      i = skipTrivia(source, i + 1);
      continue;
    }
    if (source[i] === "." && source[i + 1] === "." && source[i + 2] === ".") {
      i = scanValue(source, i + 3);
      i = skipTrivia(source, i);
      continue;
    }
    let key;
    if (source[i] === "'" || source[i] === '"') {
      const end = scanString(source, i);
      key = unquote(source.slice(i, end));
      i = end;
    } else {
      const ident = readIdent(source, i);
      if (!ident) break;
      key = ident.value;
      i = ident.end;
    }
    i = skipTrivia(source, i);
    if (source[i] !== ":") break;
    const valueFrom = skipTrivia(source, i + 1);
    const valueTo = scanValue(source, valueFrom);
    entries.push({ key, valueFrom, valueTo });
    i = skipTrivia(source, valueTo);
  }
  return entries;
}

function findDefinePropertiesCall(source) {
  let last = null;
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "'" || char === '"') {
      i = scanString(source, i);
      continue;
    }
    if (char === "`") {
      i = scanTemplate(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      i = skipLineComment(source, i);
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i = skipBlockComment(source, i);
      continue;
    }
    if (
      source.startsWith("defineProperties", i) &&
      !isIdentChar(source[i - 1]) &&
      !isIdentChar(source[i + 16])
    ) {
      const open = skipTrivia(source, i + 16);
      if (source[open] === "(") {
        const close = scanBalanced(source, open, "(", ")");
        last = { open, close };
        i = close;
        continue;
      }
    }
    i += 1;
  }
  return last;
}

function findPropertiesObject(source, call) {
  const args = [];
  let i = skipTrivia(source, call.open + 1);
  while (i < call.close - 1) {
    if (source[i] === ")") break;
    if (source[i] === ",") {
      i = skipTrivia(source, i + 1);
      continue;
    }
    const from = i;
    const to = scanValue(source, i);
    args.push({ from, to });
    i = skipTrivia(source, to);
  }
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const arg = args[index];
    if (source[arg.from] === "{") return arg;
  }
  return null;
}

function detectQuote(sample) {
  const trimmed = sample.trim();
  if (trimmed.startsWith('"')) return '"';
  if (trimmed.startsWith("'")) return "'";
  return "'";
}

function escapeString(value, quote) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(quote, `\\${quote}`)
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

function decimalPlaces(sample) {
  const match = sample.trim().match(/^-?\d+\.(\d+)$/);
  return match ? match[1].length : 0;
}

function formatNumber(value, sample = "") {
  if (!Number.isFinite(value)) return sample.trim() || "0";
  if (Object.is(value, -0)) return "0";
  const trimmed = sample.trim();
  if (Number.isInteger(value)) {
    if (/^-?\d+\.0+$/.test(trimmed)) {
      return value.toFixed(decimalPlaces(trimmed));
    }
    return String(value);
  }
  const text = value.toPrecision(10);
  if (/e/i.test(text)) return String(value);
  return text
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

function detectObjectStyle(sample) {
  const trimmed = sample.trim();
  const multiline = trimmed.includes("\n");
  const afterColon = /:\s/.test(trimmed) ? " " : "";
  const afterComma = /,\s/.test(trimmed) ? " " : "";
  const innerPad = /^\{\s/.test(trimmed) ? " " : "";
  const indentMatch = trimmed.match(/\n([ \t]+)\S/);
  return {
    multiline,
    afterColon,
    afterComma,
    innerPad,
    indent: indentMatch ? indentMatch[1] : "  ",
  };
}

function preferredKeys(value, sample) {
  const sampleKeys = [];
  if (sample.trim().startsWith("{")) {
    try {
      const entries = readObjectEntries(
        sample,
        skipTrivia(sample, 0),
        sample.length
      );
      for (const entry of entries) sampleKeys.push(entry.key);
    } catch {
      /* Fall back to Object.keys(value). */
    }
  }
  const seen = new Set();
  const keys = [];
  for (const key of sampleKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  for (const key of Object.keys(value)) {
    if (seen.has(key) || value[key] === undefined) continue;
    keys.push(key);
  }
  return keys;
}

function sampleForKey(sample, key) {
  const trimmed = sample.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return "";
  try {
    const from = skipTrivia(sample, 0);
    if (sample[from] !== "{") return "";
    const entries = readObjectEntries(sample, from, sample.length);
    const entry = entries.find((item) => item.key === key);
    return entry ? sample.slice(entry.valueFrom, entry.valueTo) : "";
  } catch {
    return "";
  }
}

function isIdentKey(key) {
  return IDENT_START.test(key[0] || "") && [...key].every(isIdentChar);
}

function serializeDefaultValue(value, sample = "") {
  if (typeof value === "number") return formatNumber(value, sample);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const quote = detectQuote(sample);
    return `${quote}${escapeString(value, quote)}${quote}`;
  }
  if (value == null) return "null";
  if (Array.isArray(value)) {
    const style = detectObjectStyle(sample);
    const items = value.map((item, index) => {
      const itemSample = (() => {
        try {
          if (!sample.trim().startsWith("[")) return "";
          const from = skipTrivia(sample, 0);
          let i = skipTrivia(sample, from + 1);
          let current = 0;
          while (i < sample.length - 1) {
            if (sample[i] === "]") break;
            if (sample[i] === ",") {
              i = skipTrivia(sample, i + 1);
              continue;
            }
            const valueFrom = i;
            const valueTo = scanValue(sample, i);
            if (current === index) return sample.slice(valueFrom, valueTo);
            current += 1;
            i = skipTrivia(sample, valueTo);
          }
        } catch {
          return "";
        }
        return "";
      })();
      return serializeDefaultValue(item, itemSample);
    });
    if (style.multiline) {
      return `[\n${items
        .map((item) => `${style.indent}${item}`)
        .join(",\n")}\n]`;
    }
    return `[${items.join(`,${style.afterComma}`)}]`;
  }
  if (typeof value === "object") {
    const style = detectObjectStyle(sample);
    const keys = preferredKeys(value, sample);
    const fields = keys.map((key) => {
      const keyText = isIdentKey(key)
        ? key
        : `${detectQuote(sample)}${escapeString(key, detectQuote(sample))}${detectQuote(sample)}`;
      return `${keyText}:${style.afterColon}${serializeDefaultValue(
        value[key],
        sampleForKey(sample, key)
      )}`;
    });
    if (style.multiline) {
      const closeIndent = sample.match(/\n([ \t]*)\}$/)?.[1] ?? "";
      return `{\n${fields
        .map((field) => `${style.indent}${field}`)
        .join(",\n")}\n${closeIndent}}`;
    }
    return `{${style.innerPad}${fields.join(`,${style.afterComma}`)}${style.innerPad}}`;
  }
  return "null";
}

export function applyDefaultValuesToProps(props, values) {
  const next = { ...props };
  for (const key of Object.keys(values || {})) {
    if (!next[key] || values[key] === undefined) continue;
    const value = values[key];
    next[key] = {
      ...next[key],
      defaultValue:
        value && typeof value === "object" ? structuredClone(value) : value,
    };
  }
  return next;
}

export function applyDefaultValuesToSource(source, values) {
  if (!source || !values || !Object.keys(values).length) return source;
  const call = findDefinePropertiesCall(source);
  if (!call) {
    throw new Error("Could not find a defineProperties() call to update.");
  }
  const propsObj = findPropertiesObject(source, call);
  if (!propsObj) {
    throw new Error(
      "defineProperties() does not use an object literal, so defaults cannot be saved."
    );
  }
  const properties = readObjectEntries(source, propsObj.from, propsObj.to);
  const replacements = [];
  for (const property of properties) {
    if (!Object.prototype.hasOwnProperty.call(values, property.key)) continue;
    const value = values[property.key];
    if (value === undefined) continue;
    if (source[property.valueFrom] !== "{") continue;
    const fields = readObjectEntries(source, property.valueFrom, property.valueTo);
    const defaultField = fields.find((field) => field.key === "defaultValue");
    if (!defaultField) continue;
    const sample = source.slice(defaultField.valueFrom, defaultField.valueTo);
    const next = serializeDefaultValue(value, sample);
    if (next === sample) continue;
    replacements.push({
      from: defaultField.valueFrom,
      to: defaultField.valueTo,
      text: next,
    });
  }
  let nextSource = source;
  for (const replacement of replacements.sort((a, b) => b.from - a.from)) {
    nextSource =
      nextSource.slice(0, replacement.from) +
      replacement.text +
      nextSource.slice(replacement.to);
  }
  return nextSource;
}
