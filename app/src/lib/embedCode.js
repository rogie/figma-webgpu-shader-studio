function browserShaderSource(source) {
  return source
    .replace(/^\s*import\s+[^;\n]+;?\s*$/gm, "")
    .replace(/\bexport\s+default\s+/g, "")
    .replace(/\bexport\s+(?=(async\s+)?function\b)/g, "");
}

function inlineScriptSafe(value) {
  return value.replace(/<\/script/gi, "<\\/script");
}

export function buildStandaloneEmbedCode({ source, values, kind }) {
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
