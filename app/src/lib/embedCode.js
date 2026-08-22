function browserShaderSource(source) {
  return source
    .replace(/^\s*import\s+[^;\n]+;?\s*$/gm, "")
    .replace(/\bexport\s+default\s+/g, "")
    .replace(/\bexport\s+(?=(async\s+)?function\b)/g, "");
}

function inlineScriptSafe(value) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function jsonLiteral(value) {
  return JSON.stringify(value ?? {}, null, 2).replace(/</g, "\\u003c");
}

function wrapLayerModule(source) {
  return `(() => {
${inlineScriptSafe(browserShaderSource(source || ""))}
    return {
      setup: typeof setup === "function" ? setup : undefined,
      render: typeof render === "function" ? render : undefined,
    };
  })()`;
}

function compositionLayersLiteral(layers) {
  return (layers || [])
    .map(
      (layer) => `    {
      role: ${JSON.stringify(layer.role === "fill" ? "fill" : "effect")},
      enabled: ${layer.enabled !== false},
      params: ${jsonLiteral(layer.params)},
      state: {},
      module: ${wrapLayerModule(layer.source)},
    }`
    )
    .join(",\n");
}

const PASSTHROUGH_WGSL = `
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VsOut {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var result: VsOut;
  let p = pos[vi];
  result.position = vec4f(p, 0.0, 1.0);
  result.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return result;
}

@group(0) @binding(0) var srcSampler: sampler;
@group(0) @binding(1) var srcTexture: texture_2d<f32>;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  return textureSample(srcTexture, srcSampler, in.uv);
}
`;

function buildStandaloneCompositionEmbedCode(composition) {
  const isFill = Boolean(composition?.isFill);
  const layersLiteral = compositionLayersLiteral(composition?.layers);
  const passthroughWgsl = JSON.stringify(PASSTHROUGH_WGSL);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WebGPU Composition</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111; }
    canvas { display: block; width: 100%; height: 100%; }
    #error { position: fixed; inset: 0; display: none; margin: 0; padding: 16px; color: #ffb4b4; background: #1e1111; white-space: pre-wrap; font: 12px/1.5 monospace; }
  </style>
</head>
<body>
  <canvas id="shader"></canvas>
  <pre id="error"></pre>
  <script type="module">
    const isFill = ${isFill};
    function defineProperties() {}

    const layers = [
${layersLiteral}
    ];

    const canvas = document.querySelector("#shader");
    const errorView = document.querySelector("#error");

    function showError(error) {
      errorView.style.display = "block";
      errorView.textContent = error?.stack || error?.message || String(error);
    }

    async function start() {
      if (!navigator.gpu) {
        throw new Error("WebGPU is not available in this browser.");
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("Unable to acquire a WebGPU adapter.");
      const device = await adapter.requestDevice();
      const context = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: "premultiplied",
      });

      const frame = {
        input: null,
        output: null,
        time: 0,
        deltaTime: 0,
        frame: 0,
        mousePosition: { x: 0, y: 0 },
      };
      let inputTexture = null;
      let lastTime = performance.now();
      let initialized = false;
      const pingpong = [null, null];
      let passthroughPipeline = null;
      let passthroughBindLayout = null;
      let passthroughSampler = null;

      canvas.addEventListener("pointermove", (event) => {
        const rect = canvas.getBoundingClientRect();
        frame.mousePosition = {
          x: (event.clientX - rect.left) * canvas.width / rect.width,
          y: (event.clientY - rect.top) * canvas.height / rect.height,
        };
      });
      canvas.addEventListener("pointerleave", () => {
        frame.mousePosition = { x: 0, y: 0 };
      });

      function destroyLayerStates() {
        for (const layer of layers) {
          for (const resource of Object.values(layer.state || {})) {
            if (resource && typeof resource.destroy === "function") {
              resource.destroy();
            }
          }
          layer.state = {};
        }
      }

      function destroyPingpong() {
        for (const texture of pingpong) {
          try { texture?.destroy(); } catch {}
        }
        pingpong[0] = null;
        pingpong[1] = null;
      }

      function ensureTexture(index, width, height) {
        const existing = pingpong[index];
        if (existing && existing.width === width && existing.height === height) {
          return existing;
        }
        try { existing?.destroy(); } catch {}
        pingpong[index] = device.createTexture({
          size: [width, height],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        return pingpong[index];
      }

      function makeEffectInput(width, height) {
        inputTexture?.destroy();
        inputTexture = device.createTexture({
          size: [width, height],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const input = document.createElement("canvas");
        input.width = width;
        input.height = height;
        const ctx = input.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#ff7a59");
        gradient.addColorStop(0.5, "#7c5cff");
        gradient.addColorStop(1, "#35d0ba");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.5, Math.min(width, height) * 0.24, 0, Math.PI * 2);
        ctx.fill();

        device.queue.copyExternalImageToTexture(
          { source: input },
          { texture: inputTexture, premultipliedAlpha: true },
          [width, height],
        );
        frame.input = inputTexture;
      }

      function ensurePassthrough(outputFormat) {
        if (passthroughPipeline) return;
        const module = device.createShaderModule({ code: ${passthroughWgsl} });
        passthroughBindLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
          ],
        });
        passthroughSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
        passthroughPipeline = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [passthroughBindLayout] }),
          vertex: { module, entryPoint: "vs_main" },
          fragment: { module, entryPoint: "fs_main", targets: [{ format: outputFormat }] },
          primitive: { topology: "triangle-list" },
        });
      }

      function presentPassthrough(output, input) {
        const encoder = device.createCommandEncoder();
        if (!input) {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: output.createView(),
              loadOp: "clear",
              storeOp: "store",
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
            }],
          });
          pass.end();
          device.queue.submit([encoder.finish()]);
          return;
        }
        ensurePassthrough(output.format);
        const bindGroup = device.createBindGroup({
          layout: passthroughBindLayout,
          entries: [
            { binding: 0, resource: passthroughSampler },
            { binding: 1, resource: input.createView() },
          ],
        });
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: output.createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          }],
        });
        pass.setPipeline(passthroughPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
        device.queue.submit([encoder.finish()]);
      }

      function layerFrame(layer, input, output) {
        return {
          input,
          output,
          state: layer.state,
          params: layer.params || {},
          time: frame.time,
          deltaTime: frame.deltaTime,
          frame: frame.frame,
          mousePosition: frame.mousePosition,
        };
      }

      function presentComposition() {
        const swapchain = context.getCurrentTexture();
        const fillLayer = layers.find((layer) => layer.role === "fill" && layer.enabled && layer.module.render);
        const effects = layers.filter((layer) => layer.role === "effect" && layer.enabled && layer.module.render);
        const fromInput = !isFill && frame.input;
        const width = fromInput ? frame.input.width : swapchain.width;
        const height = fromInput ? frame.input.height : swapchain.height;
        let current = frame.input;

        if (fillLayer) {
          const target = effects.length ? ensureTexture(0, width, height) : swapchain;
          fillLayer.module.render(device, layerFrame(fillLayer, null, target));
          current = target;
        }

        if (!effects.length) {
          if (!fillLayer) presentPassthrough(swapchain, current);
          return;
        }

        effects.forEach((layer, index) => {
          const isLast = index === effects.length - 1;
          const target = isLast
            ? swapchain
            : ensureTexture((fillLayer ? 1 : 0) + (index % 2), width, height);
          if (!current) {
            presentPassthrough(target, null);
            current = target;
            return;
          }
          layer.module.render(device, layerFrame(layer, current, target));
          current = target;
        });
      }

      function setupLayers() {
        for (const layer of layers) {
          layer.module.setup?.(device, layerFrame(layer, frame.input, frame.output));
        }
      }

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (initialized && canvas.width === width && canvas.height === height) return false;
        canvas.width = width;
        canvas.height = height;
        destroyLayerStates();
        destroyPingpong();
        if (!isFill) makeEffectInput(width, height);
        frame.output = context.getCurrentTexture();
        setupLayers();
        initialized = true;
        return true;
      }

      resize();
      if (!canvas.width || !canvas.height) {
        canvas.width = 1;
        canvas.height = 1;
      }

      function draw(now) {
        try {
          resize();
          frame.deltaTime = now - lastTime;
          frame.time += frame.deltaTime;
          frame.frame += 1;
          lastTime = now;
          presentComposition();
          requestAnimationFrame(draw);
        } catch (error) {
          showError(error);
        }
      }
      requestAnimationFrame(draw);
    }

    start().catch(showError);
  </script>
</body>
</html>`;
}

export function buildStandaloneEmbedCode({ source, values, kind, composition }) {
  if (composition) {
    return buildStandaloneCompositionEmbedCode(composition);
  }
  const params = JSON.stringify(values || {}, null, 2).replace(/</g, "\\u003c");
  const shaderSource = inlineScriptSafe(browserShaderSource(source));
  const isEffect = kind === "effect";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WebGPU Shader</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #111; }
    canvas { display: block; width: 100%; height: 100%; }
    #error { position: fixed; inset: 0; display: none; margin: 0; padding: 16px; color: #ffb4b4; background: #1e1111; white-space: pre-wrap; font: 12px/1.5 monospace; }
  </style>
</head>
<body>
  <canvas id="shader"></canvas>
  <pre id="error"></pre>
  <script type="module">
    // Current Shader Studio property values. The shader reads these through
    // frame.params and writes them into its own uniform buffers.
    const params = ${params};
    const isEffect = ${isEffect};

    // Figma shader modules call this at load time; the standalone page already
    // has the current values above, so only the runtime functions are needed.
    function defineProperties() {}

${shaderSource}

    const canvas = document.querySelector("#shader");
    const errorView = document.querySelector("#error");

    function showError(error) {
      errorView.style.display = "block";
      errorView.textContent = error?.stack || error?.message || String(error);
    }

    async function start() {
      if (!navigator.gpu) {
        throw new Error("WebGPU is not available in this browser.");
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("Unable to acquire a WebGPU adapter.");
      const device = await adapter.requestDevice();
      const context = canvas.getContext("webgpu");
      const format = navigator.gpu.getPreferredCanvasFormat();
      context.configure({
        device,
        format,
        alphaMode: "premultiplied",
      });

      const frame = {
        input: null,
        output: null,
        state: {},
        params,
        time: 0,
        deltaTime: 0,
        frame: 0,
        mousePosition: { x: 0, y: 0 },
      };
      let inputTexture = null;
      let lastTime = performance.now();
      let initialized = false;

      canvas.addEventListener("pointermove", (event) => {
        const rect = canvas.getBoundingClientRect();
        frame.mousePosition = {
          x: (event.clientX - rect.left) * canvas.width / rect.width,
          y: (event.clientY - rect.top) * canvas.height / rect.height,
        };
      });
      canvas.addEventListener("pointerleave", () => {
        frame.mousePosition = { x: 0, y: 0 };
      });

      function destroyState() {
        for (const resource of Object.values(frame.state)) {
          if (resource && typeof resource.destroy === "function") {
            resource.destroy();
          }
        }
        frame.state = {};
      }

      function makeEffectInput(width, height) {
        inputTexture?.destroy();
        inputTexture = device.createTexture({
          size: [width, height],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });

        // A self-contained fallback image for shader effects. Replace this
        // drawing with your own image/video upload if desired.
        const input = document.createElement("canvas");
        input.width = width;
        input.height = height;
        const ctx = input.getContext("2d");
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#ff7a59");
        gradient.addColorStop(0.5, "#7c5cff");
        gradient.addColorStop(1, "#35d0ba");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.beginPath();
        ctx.arc(width * 0.5, height * 0.5, Math.min(width, height) * 0.24, 0, Math.PI * 2);
        ctx.fill();

        device.queue.copyExternalImageToTexture(
          { source: input },
          { texture: inputTexture, premultipliedAlpha: true },
          [width, height],
        );
        frame.input = inputTexture;
      }

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (
          initialized &&
          canvas.width === width &&
          canvas.height === height
        ) return false;
        canvas.width = width;
        canvas.height = height;
        destroyState();
        if (isEffect) makeEffectInput(width, height);
        frame.output = context.getCurrentTexture();
        if (typeof setup === "function") setup(device, frame);
        initialized = true;
        return true;
      }

      resize();
      if (!canvas.width || !canvas.height) {
        canvas.width = 1;
        canvas.height = 1;
      }

      function draw(now) {
        try {
          resize();
          frame.deltaTime = now - lastTime;
          frame.time += frame.deltaTime;
          frame.frame += 1;
          lastTime = now;
          frame.output = context.getCurrentTexture();
          render(device, frame);
          requestAnimationFrame(draw);
        } catch (error) {
          showError(error);
        }
      }
      requestAnimationFrame(draw);
    }

    start().catch(showError);
  </script>
</body>
</html>`;
}
