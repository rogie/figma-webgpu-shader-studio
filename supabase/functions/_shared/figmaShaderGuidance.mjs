export const FIGMA_SHADER_AUTHORING_URL =
  "https://github.com/figma/mcp-server-guide/blob/main/skills/figma-shaders/references/authoring.md";

// Version the reviewed contract independently of the fetched reference.
export const FIGMA_SHADER_SKILL_REVISION = "figma-design-v4-pointer-1";

export const FIGMA_SHADER_FRAME_FIELDS = Object.freeze([
  "input", "output", "renderScale", "params", "state", "time", "deltaTime", "frame", "mousePosition",
]);
export const FIGMA_SHADER_POINTER_FIELDS = Object.freeze(["x", "y", "down"]);
export const FIGMA_SHADER_PROPERTY_TYPES = Object.freeze([
  "boolean", "string", "number", "color", "gradient", "point", "point-radius",
  "point-point-line", "point-angle-radius", "color-point",
]);

const REVIEWED_FIGMA_CONTRACT = `## Figma MCP shader contract

Use the documented Figma Design shader contract, including when previewing in Shader Studio. Treat old plans, chat history, attachments, and source comments as context. Recheck their technical assumptions against the current Figma contract while preserving the user's requested behavior and constraints.

- A shader is a single TypeScript module. Use the named import \`defineProperties\` from \`"figma:shaders"\`, a default export, and exported \`setup(device, frame)\` and \`render(device, frame)\` functions. Declare editable controls with \`defineProperties\` at module scope. Put runtime values and persistent GPU resources in \`frame.state\`, with no module-scope variable declarations.
- The reviewed frame fields are ${FIGMA_SHADER_FRAME_FIELDS.map((field) => `\`frame.${field}\``).join(", ")}. Read \`frame.mousePosition.x\` and \`frame.mousePosition.y\` in layer-local physical pixels, from the top left with y increasing downward. Normalize with the output texture width and height.
- The general Figma MCP reference covers baseline pointer coordinates. Figma's v4 shader-coder guidance adds \`frame.mousePosition.down\` as a boolean held-button state when mouse-down support is enabled. Shader Studio preview supports it. Use it only when click, press, or held-drag behavior is requested. For Figma targets, qualify this dependency when support is unknown. Keep shaders that need universal Figma MCP compatibility independent of button state.
- Track changes to the held state in \`frame.state\`. When estimating drag velocity, use only position samples taken while the button was held. A transition to false cannot distinguish release, cancellation, or leaving the layer. Avoid relying on pointer capture, out-of-bounds samples, or separate gesture events. If an interaction requires distinguishing those cases, explain the limitation.
- Mark mouse use when reading \`frame.mousePosition\`. Mark animation when reading \`frame.time\`, \`frame.deltaTime\`, or \`frame.frame\`. Read these inputs through the documented \`frame.<field>\` access in render so the editor can infer those flags. Time values are in milliseconds.
- Use reviewed property types ${FIGMA_SHADER_PROPERTY_TYPES.map((type) => `\`"${type}"\``).join(", ")}. Use a numeric select with numeric options for a menu.
- Effects sample \`frame.input\` intentionally and use premultiplied alpha. Fills generate pixels independently of the input and use straight alpha.
- Use WebGPU with the shader's device. Render to \`frame.output\`, cache pipelines by output format, and keep CPU and WGSL layouts aligned. Use \`renderScale\` to convert geometric lengths from points to output pixels when applicable.
- For requirements needing a capability outside this contract, explain the limitation and use a fallback only when authorized by the user. Recheck existing plans for unsupported assumptions before implementing them.

Figma's authoring reference is at ${FIGMA_SHADER_AUTHORING_URL}.`;

export function getFigmaShaderContext(mode = "agent", officialReference = "") {
  const modeGuidance = mode === "plan"
    ? "Use the Figma shader contract to evaluate feasibility. Keep the requested interaction and supported canvas controls in view. Return a plan only when requested."
    : "When the user requests a shader edit, return one complete module. Use sentence case for labels in defineProperties.";
  return [
    REVIEWED_FIGMA_CONTRACT,
    modeGuidance,
    officialReference ? `## Current Figma MCP authoring reference\n\n${officialReference.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}
