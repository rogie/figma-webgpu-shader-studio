import { parse } from "@babel/parser";
import {
  FIGMA_SHADER_FRAME_FIELDS,
  FIGMA_SHADER_POINTER_FIELDS,
} from "../../../supabase/functions/_shared/figmaShaderGuidance.mjs";

const FRAME_FIELDS = new Set(FIGMA_SHADER_FRAME_FIELDS);
const POINTER_FIELDS = new Set(FIGMA_SHADER_POINTER_FIELDS);
const LIFECYCLE_NAMES = new Set(["setup", "render"]);
const FRAME = 1;
const POINTER = 2;

const FORBIDDEN_GLOBALS = new Set([
  "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame",
  "fetch", "XMLHttpRequest", "WebSocket", "Worker", "importScripts",
  "window", "self", "globalThis", "document", "navigator", "localStorage",
  "sessionStorage", "AudioContext", "Float64Array", "Float16Array",
  "location", "performance", "Image", "ImageData", "OffscreenCanvas",
  "addEventListener", "removeEventListener", "dispatchEvent",
  "requestIdleCallback", "cancelIdleCallback", "setImmediate", "clearImmediate",
  "require", "module", "exports", "eval", "Function",
]);

const FUNCTION_NODES = new Set([
  "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression",
  "ObjectMethod", "ClassMethod", "ClassPrivateMethod",
]);

const BLOCK_NODES = new Set([
  "BlockStatement", "CatchClause", "ForStatement", "ForInStatement",
  "ForOfStatement", "SwitchStatement", "ClassExpression",
]);

const WRAPPERS = new Set([
  "TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression",
  "TSTypeAssertion", "TSInstantiationExpression", "ParenthesizedExpression",
]);

const TYPE_ONLY_NODES = new Set([
  "TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSDeclareFunction",
]);

const NON_RUNTIME_KEYS = new Set([
  "loc", "extra", "typeAnnotation", "typeParameters", "typeArguments",
  "returnType", "superTypeParameters", "implements",
]);

function failure(reason) {
  return { ok: false, reason: `Figma shader compatibility: ${reason}` };
}

function nameOf(node) {
  return node?.type === "Identifier" ? node.name : node?.value;
}

function staticKey(node, computed) {
  if (!computed || node?.type === "StringLiteral" || node?.type === "NumericLiteral") {
    return nameOf(node);
  }
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

function moduleContract(program) {
  const functions = new Map();
  const entryNames = new Map();
  let definePropertiesName;

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    const [specifier] = statement.specifiers;
    if (
      statement.source.value !== "figma:shaders" ||
      statement.importKind === "type" ||
      statement.attributes?.length ||
      statement.specifiers.length !== 1 ||
      specifier.type !== "ImportSpecifier" ||
      specifier.importKind === "type" ||
      nameOf(specifier.imported) !== "defineProperties"
    ) {
      return failure('Only the defineProperties import from "figma:shaders" is documented.');
    }
    definePropertiesName = specifier.local.name;
  }

  for (const statement of program.body) {
    if (
      statement.type === "ExportAllDeclaration" ||
      (statement.type === "ExportNamedDeclaration" && statement.source)
    ) {
      return failure("External module exports are unavailable.");
    }
    const node = statement.declaration ?? statement;
    if (node.type === "FunctionDeclaration") {
      if (node.id) functions.set(node.id.name, node);
      if (statement.type === "ExportNamedDeclaration") {
        if (!LIFECYCLE_NAMES.has(node.id.name)) {
          return failure("The documented named shader exports are setup and render.");
        }
        entryNames.set(node.id.name, node.id.name);
      }
      continue;
    }
    if (statement.type === "ExportNamedDeclaration" && !statement.declaration) {
      for (const specifier of statement.specifiers) {
        if (statement.exportKind === "type" || specifier.exportKind === "type") continue;
        const exported = nameOf(specifier.exported);
        if (!LIFECYCLE_NAMES.has(exported)) return failure("The documented named shader exports are setup and render.");
        entryNames.set(exported, specifier.local.name);
      }
      continue;
    }
    if (
      node.type === "ImportDeclaration" ||
      node.type === "EmptyStatement" ||
      TYPE_ONLY_NODES.has(node.type) ||
      (node.type === "VariableDeclaration" && node.declare)
    ) continue;
    if (
      node.type === "ExpressionStatement" &&
      node.expression.type === "CallExpression" &&
      node.expression.callee.type === "Identifier" &&
      node.expression.callee.name === definePropertiesName
    ) continue;
    return failure("Keep module scope for imports, function and type declarations, and the defineProperties call. Put runtime variables and GPU setup inside setup or render.");
  }

  const render = functions.get(entryNames.get("render"));
  const setup = functions.get(entryNames.get("setup"));
  if (!render) return failure("Export a render function for the shader module.");
  if (entryNames.has("setup") && !setup) return failure("The setup export must be a function.");
  return { entries: [render, setup].filter(Boolean) };
}

function bindingOf(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return current.bindings.get(name);
  }
  return undefined;
}

function bindNames(node, scope, identifiers) {
  if (!node) return;
  if (node.type === "Identifier") {
    identifiers.add(node);
    if (!scope.bindings.has(node.name)) scope.bindings.set(node.name, { flags: 0 });
  } else if (node.type === "ObjectPattern") {
    for (const entry of node.properties) bindNames(entry.value ?? entry.argument, scope, identifiers);
  } else if (node.type === "ArrayPattern") {
    for (const element of node.elements) bindNames(element, scope, identifiers);
  } else if (node.type === "AssignmentPattern" || node.type === "RestElement") {
    bindNames(node.left ?? node.argument, scope, identifiers);
  }
}

function collectNodes(program, entrypoints) {
  const records = [];
  const scopes = new Map();
  const functionNodes = new Map();
  const identifiers = new WeakSet();
  const root = { parent: null, bindings: new Map(), functionScope: null };
  root.functionScope = root;

  function walk(node, scope, parent, key) {
    if (node?.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) bindNames(specifier.local, scope, identifiers);
      return;
    }
    if (
      !node?.type || TYPE_ONLY_NODES.has(node.type) ||
      node.type === "VariableDeclaration" && node.declare
    ) return;
    if (node.type.startsWith("TS") && !WRAPPERS.has(node.type) && node.type !== "TSEnumDeclaration") return;
    if (node.type === "FunctionDeclaration" && node.id) {
      bindNames(node.id, scope, identifiers);
      functionNodes.set(bindingOf(scope, node.id.name), node);
    }
    if (FUNCTION_NODES.has(node.type) || BLOCK_NODES.has(node.type)) {
      scope = { parent: scope, bindings: new Map(), functionScope: scope.functionScope };
    }
    if (FUNCTION_NODES.has(node.type)) {
      scope.functionScope = scope;
      scopes.set(node, scope);
      for (const param of node.params) bindNames(param, scope, identifiers);
      if (node.type === "FunctionExpression") bindNames(node.id, scope, identifiers);
    }
    if (node.type === "CatchClause") bindNames(node.param, scope, identifiers);
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") bindNames(node.id, scope, identifiers);
    if (node.type === "VariableDeclarator") {
      const declarationScope = parent.kind === "var" ? scope.functionScope : scope;
      bindNames(node.id, declarationScope, identifiers);
      if (node.id.type === "Identifier" && FUNCTION_NODES.has(node.init?.type)) {
        functionNodes.set(bindingOf(declarationScope, node.id.name), node.init);
      }
    }
    records.push({ node, scope, parent, key });
    for (const [childKey, child] of Object.entries(node)) {
      if (NON_RUNTIME_KEYS.has(childKey)) continue;
      if (Array.isArray(child)) {
        for (const value of child) walk(value, scope, node, childKey);
      } else {
        walk(child, scope, node, childKey);
      }
    }
  }

  walk(program, root);
  for (const entry of entrypoints) {
    if (entry?.params[1]) applyPattern(entry.params[1], FRAME, scopes.get(entry));
  }
  return { records, scopes, functionNodes, identifiers };
}

function memberFlags(flags, property) {
  return flags & FRAME && property === "mousePosition" ? POINTER : 0;
}

function valueFlags(node, scope) {
  if (!node) return 0;
  if (WRAPPERS.has(node.type)) return valueFlags(node.expression, scope);
  switch (node.type) {
    case "Identifier":
      return bindingOf(scope, node.name)?.flags ?? 0;
    case "MemberExpression":
    case "OptionalMemberExpression":
      return memberFlags(valueFlags(node.object, scope), staticKey(node.property, node.computed));
    case "ConditionalExpression":
      return valueFlags(node.consequent, scope) | valueFlags(node.alternate, scope);
    case "LogicalExpression":
      return valueFlags(node.left, scope) | valueFlags(node.right, scope);
    case "SequenceExpression":
      return valueFlags(node.expressions.at(-1), scope);
    case "AssignmentExpression":
    case "AssignmentPattern":
      return valueFlags(node.right, scope);
    default:
      return 0;
  }
}

function applyPattern(node, flags, scope) {
  if (!node || !flags) return false;
  if (node.type === "ObjectPattern") {
    let changed = false;
    for (const entry of node.properties) {
      const property = staticKey(entry.key, entry.computed);
      if (applyPattern(entry.value, memberFlags(flags, property), scope)) changed = true;
    }
    return changed;
  }
  if (node.type === "AssignmentPattern") return applyPattern(node.left, flags, scope);
  if (node.type !== "Identifier") return false;
  const binding = bindingOf(scope, node.name);
  if (!binding || (binding.flags & flags) === flags) return false;
  binding.flags |= flags;
  return true;
}

function compatibleMember(flags, property, kind) {
  if (kind === "fill" && (flags & FRAME) && property === "input") {
    return failure("A Figma shader fill cannot read frame.input.");
  }
  if (flags & FRAME && !FRAME_FIELDS.has(property)) {
    return failure(property
      ? `frame.${property} is outside the documented Figma shader frame API.`
      : "Read shader frame fields by their documented names.");
  }
  if (flags & POINTER && !POINTER_FIELDS.has(property)) {
    return failure(property
      ? `frame.mousePosition.${property} is outside the documented Figma pointer API.`
      : "Read pointer coordinates through frame.mousePosition.x and .y.");
  }
  return null;
}

function compatiblePattern(node, flags, kind) {
  if (!node || !flags || node.type === "Identifier") return null;
  if (node.type === "AssignmentPattern") return compatiblePattern(node.left, flags, kind);
  if (node.type !== "ObjectPattern") return failure("Read frame and pointer properties through documented named fields.");
  for (const entry of node.properties) {
    const property = staticKey(entry.key, entry.computed);
    const issue = compatibleMember(flags, property, kind) ??
      compatiblePattern(entry.value, memberFlags(flags, property), kind);
    if (issue) return issue;
  }
  return null;
}

function localFunction(node, scope, functionNodes) {
  if (node?.callee.type === "Identifier") {
    return functionNodes.get(bindingOf(scope, node.callee.name));
  }
  return FUNCTION_NODES.has(node?.callee.type) ? node.callee : undefined;
}

function isMember(node) {
  return node.type === "MemberExpression" || node.type === "OptionalMemberExpression";
}

function isCall(node) {
  return node.type === "CallExpression" || node.type === "OptionalCallExpression";
}

function isReference(node, parent, key, identifiers) {
  if (!parent || identifiers.has(node)) return false;
  if (key === "key" && !parent.computed) return false;
  if (key === "property" && isMember(parent) && !parent.computed) return false;
  return key !== "id" && key !== "params" && key !== "label" && key !== "exported";
}

function canUseObject(node, parent, key, scope, functionNodes) {
  if (!parent) return false;
  if (node.type === "AssignmentPattern" || parent.type === "ExpressionStatement") return true;
  if (key === "object" && isMember(parent)) return true;
  if (key === "init" && parent.type === "VariableDeclarator") return true;
  if (key === "right" && parent.type === "AssignmentExpression") {
    return parent.operator === "=" && ["Identifier", "ObjectPattern"].includes(parent.left.type);
  }
  if (key === "left" && parent.type === "AssignmentExpression" && parent.operator === "=") {
    return node.type === "Identifier";
  }
  if (isCall(parent) && key === "arguments") {
    const callee = localFunction(parent, scope, functionNodes);
    return Boolean(callee?.params[parent.arguments.indexOf(node)]);
  }
  return WRAPPERS.has(parent.type) ||
    ["AssignmentPattern", "ConditionalExpression", "LogicalExpression", "SequenceExpression", "BinaryExpression"].includes(parent.type) ||
    key === "test" ||
    (parent.type === "UnaryExpression" && ["!", "typeof", "void"].includes(parent.operator));
}

/**
 * Compatibility checks for generated Figma shaders, before the preview evaluates them.
 * These checks supplement Figma's build and are not a JavaScript sandbox.
 */
export function validateFigmaChatCompatibility(source, { kind } = {}) {
  let program;
  try {
    ({ program } = parse(source, { sourceType: "module", plugins: ["typescript"], createImportExpressions: true }));
  } catch (error) {
    return { ok: false, reason: `Syntax error: ${error.message}`, autoHealable: true };
  }
  const contract = moduleContract(program);
  if (!contract.entries) return contract;
  const { records, scopes, functionNodes, identifiers } = collectNodes(program, contract.entries);
  const assignments = [];
  for (const entry of contract.entries) {
    const pattern = entry?.params[1];
    const issue = compatiblePattern(pattern, FRAME, kind);
    if (issue) return issue;
  }
  // A reassigned function target may no longer refer to its original helper.
  for (const { node, scope } of records) {
    if (node.type === "AssignmentExpression" && node.left.type === "Identifier") {
      functionNodes.delete(bindingOf(scope, node.left.name));
    }
  }
  for (const { node, scope } of records) {
    if (node.type === "VariableDeclarator") {
      assignments.push([node.id, scope, node.init, scope]);
    } else if (node.type === "AssignmentPattern" || node.type === "AssignmentExpression" && node.operator === "=") {
      assignments.push([node.left, scope, node.right, scope]);
    } else if (isCall(node)) {
      const callee = localFunction(node, scope, functionNodes);
      if (callee) callee.params.forEach((param, index) => {
        assignments.push([param, scopes.get(callee), node.arguments[index], scope]);
      });
    }
  }
  // Propagate frame and pointer aliases to a fixed point across declarations,
  // assignments, and arguments passed to locally defined helper functions.
  let changed;
  do {
    changed = false;
    for (const [pattern, targetScope, value, valueScope] of assignments) {
      if (applyPattern(pattern, valueFlags(value, valueScope), targetScope)) changed = true;
    }
  } while (changed);

  for (const [pattern, , value, scope] of assignments) {
    const issue = compatiblePattern(pattern, valueFlags(value, scope), kind);
    if (issue) return issue;
  }
  for (const { node, scope, parent, key } of records) {
    if (node.type === "ImportExpression" || node.type === "Import" || node.type === "MetaProperty") {
      return failure("Dynamic imports and module metadata are unavailable.");
    }
    if (
      node.type === "Identifier" && FORBIDDEN_GLOBALS.has(node.name) &&
      isReference(node, parent, key, identifiers) && !bindingOf(scope, node.name)
    ) return failure(`${node.name} is unavailable in a Figma shader module.`);
    if (isMember(node)) {
      const flags = valueFlags(node.object, scope);
      const issue = compatibleMember(flags, staticKey(node.property, node.computed), kind);
      if (issue) return issue;
      if (flags && (
        (parent?.type === "AssignmentExpression" && key === "left") ||
        parent?.type === "UpdateExpression" ||
        (parent?.type === "UnaryExpression" && parent.operator === "delete")
      )) return failure("Only read documented shader frame and pointer fields. Store local values on frame.state.");
    }
    if (
      valueFlags(node, scope) &&
      (node.type !== "Identifier" || isReference(node, parent, key, identifiers)) &&
      !canUseObject(node, parent, key, scope, functionNodes)
    ) return failure("Use documented named frame and pointer fields when passing shader data.");
  }
  return { ok: true };
}
