import { transform } from "sucrase";
import { measurePerf, perfNow } from "./perf.js";

// Globals the real Figma shader runtime does NOT provide. We shadow them to
// `undefined` inside the module scope so the preview catches code that would
// break in Figma (see skills/v3.md.tmpl "Runtime API summary").
const FORBIDDEN_GLOBALS = [
  "console",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "window",
  "self",
  "globalThis",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "Float64Array",
  "Float16Array",
  "Worker",
  "importScripts",
];

// Anything imported other than `figma:shaders` "silently proxies and produces
// dead behavior" per the spec. Return a self-referential no-op proxy.
function makeDeadProxy() {
  const noop = function () {};
  const handler = {
    get() {
      return proxy;
    },
    apply() {
      return undefined;
    },
    construct() {
      return proxy;
    },
  };
  const proxy = new Proxy(noop, handler);
  return proxy;
}

function makeRequire(recordProps) {
  const dead = makeDeadProxy();
  return function require(spec) {
    if (spec === "figma:shaders") {
      return {
        defineProperties(_effect, props) {
          recordProps(props || {});
        },
      };
    }
    return dead;
  };
}

/**
 * Compile and evaluate a Figma shader module source string.
 * @param {string} source raw `.ts` module text
 * @returns {{ Effect: Function, setup: Function, render: Function, props: object }}
 * @throws on transpile or evaluation error (message surfaced to the editor)
 */
export function loadModule(source) {
  const startedAt = perfNow();
  let code;
  try {
    code = transform(source, {
      transforms: ["typescript", "imports"],
      preserveDynamicImport: true,
    }).code;
  } catch (err) {
    throw new Error("Compile error: " + (err && err.message ? err.message : String(err)));
  }

  let captured = null;
  const require = makeRequire((p) => {
    captured = p;
  });
  const module = { exports: {} };

  let factory;
  try {
    factory = new Function(
      "require",
      "exports",
      "module",
      ...FORBIDDEN_GLOBALS,
      '"use strict";\n' + code
    );
  } catch (err) {
    throw new Error("Syntax error: " + (err && err.message ? err.message : String(err)));
  }

  try {
    factory(require, module.exports, module, ...FORBIDDEN_GLOBALS.map(() => undefined));
  } catch (err) {
    throw new Error("Module error: " + (err && err.message ? err.message : String(err)));
  }

  const ns = module.exports || {};
  const Effect = ns.default;
  const setup = ns.setup;
  const render = ns.render;

  if (typeof render !== "function") {
    throw new Error('Module has no exported `render(device, frame)` function.');
  }

  const loaded = {
    Effect: typeof Effect === "function" ? Effect : function Effect() {},
    setup: typeof setup === "function" ? setup : null,
    render,
    props: captured || {},
  };
  measurePerf("module.compile", startedAt);
  return loaded;
}
