## Pointer input for Figma shaders

Use [Figma's MCP shader authoring reference](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-shaders/references/authoring.md#animation-and-mouse-input) for portable pointer input and [Figma's v4 shader-coder template](v4.md.tmpl) for targets with mouse-down support.

- Read `frame.mousePosition.x` and `.y` in layer-local physical pixels. To normalize, divide by `frame.output.width` and `.height`.
- Set `usesMouse: true` for pointer reads. Set `isAnimated: true` if the shader also reads `frame.time`, `frame.deltaTime`, or `frame.frame`.
- Use `frame.mousePosition.down` for requested click, press, or held-drag behavior when the Figma target supports mouse-down input. Shader Studio preview supports it. Treat it as a boolean for the in-bounds held state.
- Track state changes across frames when needed. A transition to false also covers leaving the layer or cancellation. Gesture events, pointer capture, and out-of-bounds samples are outside the portable shader contract.
- If a requested interaction requires unavailable input, explain the limitation and use the fallback the user approved in the plan. Ask before changing the intended interaction if the plan gives no fallback.
