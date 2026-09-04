import {
  COMPOSITION_KIND,
  compositionRefAliases,
  enabledVideoFillSoundtrack,
  mergeLayerValues,
  normalizeComposition,
  parseCompositionShaderId,
  referencedShaderKeys,
} from "./lib/composition.js";
import { cloudCompositionGraph } from "./lib/cloudCompositionGraph.js";
import { dependencySnapshotForKey } from "./lib/compositionDependencies.js";
import {
  isPaintFillType,
  paintImageSource,
  rasterizePaintFill,
  resolvePaintFill,
  sampleFallbackPaint,
} from "./lib/paintFill.js";
import { acquireWebcamStream } from "./lib/webcam.js";
import defaultInputUrl from "./assets/default-input.png";
import defaultVideoUrl from "./assets/default-input.mp4";
import { audioPlaybackSettings, enabledAudioFileInput } from "./lib/documentInputs.js";
import {
  documentAudioAssetPaths,
  hydrateAudioInputsWithUrls,
} from "./lib/documentInputMedia.js";
import { AudioInputBus } from "./runtime/audioInput.js";
import {
  supportsCopyElementImageToTexture,
  supportsHtmlInCanvas,
} from "./runtime/htmlInCanvas.js";
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import { inferFeatures, mergeShaderFeatures, supportsRenderScale } from "./runtime/params.js";
import {
  getAssetUrls,
  getShader,
  getShadersByIds,
} from "./services/shaders.js";

const EMBED_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WebGPU Shader</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; background: transparent; }
    canvas { display: block; width: 100% !important; height: 100% !important; background: transparent; }
    #loading { position: fixed; inset: 0; display: grid; place-items: center; color: #999; background: transparent; font: 12px/1.5 system-ui, sans-serif; pointer-events: none; }
    #error { position: fixed; inset: 0; display: none; margin: 0; padding: 16px; color: #ffb4b4; background: #1e1111; white-space: pre-wrap; font: 12px/1.5 monospace; }
    .embed-html-fill { box-sizing: border-box; width: 960px; height: 720px; padding: 56px; display: grid; grid-template-columns: 1.1fr .9fr; gap: 48px; align-items: center; color: #111827; background: linear-gradient(145deg, #eef2ff, #dbeafe 52%, #bfdbfe); font: 20px/1.45 system-ui, sans-serif; }
    .embed-html-fill h1 { margin: 8px 0 18px; font-size: 64px; line-height: 1; letter-spacing: -.04em; }
    .embed-html-fill p { margin: 0; }
    .embed-html-fill small { color: #4f46e5; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; }
    .embed-html-media { width: 100%; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 28px; background: #111827; box-shadow: 0 24px 60px rgba(15, 23, 42, .25); }
    .embed-html-media video { width: 100%; height: 100%; object-fit: cover; }
  </style>
</head>
<body>
  <canvas id="shader"></canvas>
  <div id="loading" role="status">Loading shader…</div>
  <pre id="error"></pre>
</body>
</html>`;

function dependencyId(shaderId) {
  const parsed = parseCompositionShaderId(shaderId);
  if (!parsed) return null;
  return String(parsed.id).replace(/^draft:/, "");
}

function fillAssetPath(fill) {
  return (
    fill?.paint?.image?.assetPath || fill?.paint?.video?.assetPath || ""
  );
}

function withFillAssetUrl(fill, urlsByPath) {
  const path = fillAssetPath(fill);
  const url = path ? urlsByPath[path] : "";
  const paint = fill?.paint;
  if (!paint || !url) return fill;
  if (paint.type === "video") {
    return {
      ...fill,
      paint: { ...paint, video: { ...(paint.video || {}), url } },
    };
  }
  return {
    ...fill,
    paint: { ...paint, image: { ...(paint.image || {}), url } },
  };
}

async function hydrateFillAssets(
  graph,
  {
    requirePublic = false,
    ownerShaderId = "",
    getAssetUrls: loadAssetUrls = getAssetUrls,
  } = {}
) {
  const normalized = normalizeComposition(graph);
  const paths = [
    ...new Set(
      [
        ...normalized.fills.map(fillAssetPath),
        ...documentAudioAssetPaths(normalized.inputs),
      ].filter(Boolean)
    ),
  ];
  if (
    requirePublic &&
    paths.some((path) => String(path).split("/")[1] !== ownerShaderId)
  ) {
    throw new Error("A referenced fill asset is not publicly readable.");
  }
  if (!paths.length) return normalized;
  const urlsByPath = await loadAssetUrls(paths);
  if (paths.some((path) => !urlsByPath[path])) {
    throw new Error("A referenced fill asset is unavailable.");
  }
  return normalizeComposition({
    ...normalized,
    fills: normalized.fills.map((fill) =>
      withFillAssetUrl(fill, urlsByPath)
    ),
    inputs: hydrateAudioInputsWithUrls(normalized.inputs, urlsByPath),
  });
}

async function resolveDependencies(
  graph,
  {
    requirePublic = false,
    dependencySnapshots = {},
    getShadersByIds: loadShadersByIds = getShadersByIds,
  } = {}
) {
  const references = referencedShaderKeys(graph);
  const ids = references
    .filter(
      (reference) =>
        typeof dependencySnapshotForKey(dependencySnapshots, reference)
          ?.source !== "string"
    )
    .map(dependencyId)
    .filter(Boolean);
  const dependencies = await loadShadersByIds(ids);
  const resolved = new Map();

  for (const reference of references) {
    const snapshot = dependencySnapshotForKey(dependencySnapshots, reference);
    if (typeof snapshot?.source !== "string" || !snapshot.source) continue;
    for (const alias of compositionRefAliases(reference)) {
      resolved.set(alias, { ...snapshot, is_public: true });
    }
  }

  for (const dependency of dependencies) {
    for (const alias of compositionRefAliases(`cloud:${dependency.id}`)) {
      resolved.set(alias, dependency);
    }
  }

  for (const reference of references) {
    const dependency = resolved.get(reference);
    if (
      !dependency ||
      dependency.kind === COMPOSITION_KIND ||
      !dependency.source ||
      (requirePublic && !dependency.is_public)
    ) {
      throw new Error(
        requirePublic
          ? "A referenced shader is not publicly readable."
          : "A referenced shader is unavailable."
      );
    }
  }
  return resolved;
}

function createVideo(url, stream = null) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  if (stream) video.srcObject = stream;
  else video.src = url;
  return video;
}

async function waitForVideo(video) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadeddata", resolve, { once: true });
      video.addEventListener(
        "error",
        () => reject(new Error("Could not load video fill.")),
        { once: true }
      );
      video.load?.();
    });
  }
  await video.play().catch(() => {});
}

function loadShaderLayer(id, role, source, values, declaredFeatures) {
  const loaded = loadModule(source);
  const features = mergeShaderFeatures(inferFeatures(source), declaredFeatures);
  return {
    layer: {
      id,
      role,
      enabled: true,
      setup: loaded.setup,
      render: loaded.render,
      props: loaded.props,
      params: mergeLayerValues(loaded.props, values),
    },
    features,
  };
}

async function createHtmlFallbackBitmap() {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 960, 720);
  gradient.addColorStop(0, "#eef2ff");
  gradient.addColorStop(0.52, "#dbeafe");
  gradient.addColorStop(1, "#bfdbfe");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 960, 720);
  context.fillStyle = "#4f46e5";
  context.font = "700 15px system-ui";
  context.fillText("LIVE INPUT", 56, 240);
  context.fillStyle = "#111827";
  context.font = "700 64px system-ui";
  context.fillText("HTML in Canvas", 56, 320);
  context.font = "20px system-ui";
  context.fillText("Real DOM and CSS rendered as a shader fill.", 56, 370);
  context.fillStyle = "#111827";
  context.beginPath();
  context.roundRect(590, 100, 300, 520, 28);
  context.fill();
  return createImageBitmap(canvas);
}

async function loadHtmlLayer(fill, canvas, host, resources) {
  if (
    supportsHtmlInCanvas() &&
    supportsCopyElementImageToTexture(host.device)
  ) {
    canvas.setAttribute("layoutsubtree", "");
    canvas.layoutSubtree = true;
    const element = document.createElement("div");
    element.className = "embed-html-fill";
    element.innerHTML = `
      <div>
        <small>Live input</small>
        <h1>HTML in Canvas</h1>
        <p>Real DOM, video, and inline CSS rendered through the shader.</p>
      </div>
      <div class="embed-html-media">
        <video src="${defaultVideoUrl}" autoplay muted loop playsinline></video>
      </div>`;
    canvas.appendChild(element);
    const video = element.querySelector("video");
    await video.play().catch(() => {});
    let active = true;
    let frameId = 0;
    const requestPaint = () => {
      if (!active) return;
      canvas.requestPaint?.();
      if (typeof video.requestVideoFrameCallback === "function") {
        frameId = video.requestVideoFrameCallback(requestPaint);
      }
    };
    requestPaint();
    resources.push(element, video, {
      close() {
        active = false;
        if (frameId && typeof video.cancelVideoFrameCallback === "function") {
          video.cancelVideoFrameCallback(frameId);
        }
      },
    });
    return {
      id: fill.id,
      role: "fill",
      enabled: true,
      source: element,
      sourceType: "html",
      sourceScaleMode: "fill",
      sourceOpacity: 1,
      props: {},
      params: {},
    };
  }

  const bitmap = await createHtmlFallbackBitmap();
  resources.push(bitmap);
  return {
    id: fill.id,
    role: "fill",
    enabled: true,
    source: bitmap,
    sourceType: "image",
    props: {},
    params: {},
  };
}

async function loadPaintLayer(fill, canvas, host, resources) {
  if (fill.type === "html") {
    return loadHtmlLayer(fill, canvas, host, resources);
  }
  let paint = resolvePaintFill(fill.paint, {
    defaultImageUrl: defaultInputUrl,
    defaultVideoUrl,
  });
  if (!isPaintFillType(paint?.type)) {
    if (fill.type === "none") return null;
    paint = sampleFallbackPaint(defaultInputUrl);
  }

  if (paint.type === "video") {
    const video = createVideo(paint.video?.url || "");
    await waitForVideo(video);
    resources.push(video);
    return {
      id: fill.id,
      role: "fill",
      enabled: true,
      source: video,
      sourceType: "video",
      sourceScaleMode: paint.video?.scaleMode || "fill",
      sourceOpacity: paint.video?.opacity ?? paint.opacity ?? 1,
      props: {},
      params: {},
    };
  }

  if (paint.type === "webcam" && paint.webcam?.live !== false) {
    const stream = navigator.mediaDevices?.getUserMedia
      ? await acquireWebcamStream({
          deviceId: paint.webcam?.deviceId || "",
          audio: false,
        })
      : null;
    if (stream) {
      const video = createVideo("", stream);
      await waitForVideo(video);
      const settings = paintImageSource(paint);
      resources.push(video, stream);
      return {
        id: fill.id,
        role: "fill",
        enabled: true,
        source: video,
        sourceType: "webcam",
        sourceScaleMode: settings.scaleMode || "fill",
        sourceOpacity: settings.opacity ?? 1,
        props: {},
        params: {},
      };
    }
  }

  const bitmap = await rasterizePaintFill(
    paint,
    host.stageCssSize.width,
    host.stageCssSize.height
  );
  resources.push(bitmap);
  return {
    id: fill.id,
    role: "fill",
    enabled: true,
    source: bitmap,
    sourceType: "image",
    props: {},
    params: {},
  };
}

async function setComposition(
  host,
  canvas,
  graph,
  resolved,
  ownEffect,
  resources
) {
  const layers = [];
  const featureList = [];

  for (const fill of graph.fills.slice().reverse()) {
    if (!fill.enabled) continue;
    if (fill.type === "shader" && fill.shaderId) {
      const dependency = resolved.get(fill.shaderId);
      const loaded = loadShaderLayer(
        fill.id,
        "fill",
        dependency.source,
        fill.values,
        dependency.features
      );
      layers.push(loaded.layer);
      featureList.push(loaded.features);
      continue;
    }
    const paintLayer = await loadPaintLayer(fill, canvas, host, resources);
    if (paintLayer) {
      layers.push(paintLayer);
      if (
        paintLayer.sourceType === "video" ||
        paintLayer.sourceType === "webcam" ||
        paintLayer.sourceType === "html"
      ) {
        featureList.push({ isAnimated: true, usesMouse: false });
      }
    }
  }

  for (const effect of graph.effects) {
    if (!effect.enabled) continue;
    const dependency = resolved.get(effect.shaderId);
    const loaded = loadShaderLayer(
      effect.id,
      "effect",
      dependency.source,
      effect.values,
      dependency.features
    );
    layers.push(loaded.layer);
    featureList.push(loaded.features);
  }

  if (ownEffect) {
    const loaded = loadShaderLayer(
      ownEffect.id,
      "effect",
      ownEffect.source,
      ownEffect.values,
      ownEffect.features
    );
    layers.push(loaded.layer);
    featureList.push(loaded.features);
  }

  const isAnimated = featureList.some((features) => features.isAnimated);
  const usesMouse = featureList.some((features) => features.usesMouse);
  const supportsAudio = featureList.some((features) => features.supportsAudio);
  const ok = await host.setComposition(layers, {
    isFill: layers.some((layer) => layer.role === "fill"),
    isAnimated: isAnimated || supportsAudio,
    usesMouse,
    supportsRenderScale: false,
    supportsAudio,
  });
  if (!ok) throw new Error("The shader could not be rendered.");
  if (isAnimated || usesMouse || supportsAudio) host.start();
  return { supportsAudio };
}

const embedPreviewCache = new Map();

function embedPreviewCacheKey(route) {
  return `${route.kind || "shader"}:${route.id}:${route.revision ?? ""}`;
}

async function prepareEmbedPreview(route, services = {}) {
  const loadShader = services.getShader || getShader;
  const row = await loadShader(route.id);
  const expectsComposition = route.kind === COMPOSITION_KIND;
  const isComposition = row.kind === COMPOSITION_KIND;
  if (
    expectsComposition !== isComposition ||
    (!isComposition && !row.source)
  ) {
    throw new Error("This shader is unavailable.");
  }
  if (row.kind === "fill") {
    const composition = await hydrateFillAssets(
      {
        fills: [],
        effects: [],
        inputs: row.composition?.inputs,
      },
      {
        requirePublic: row.is_public,
        ownerShaderId: row.id,
        getAssetUrls: services.getAssetUrls,
      },
    );
    return {
      row: { ...row, composition },
      isComposition,
      graph: null,
      resolved: null,
    };
  }

  const graph = await hydrateFillAssets(
    cloudCompositionGraph(row, { defaultImageUrl: defaultInputUrl }),
    {
      requirePublic: row.is_public,
      ownerShaderId: row.id,
      getAssetUrls: services.getAssetUrls,
    },
  );
  const resolved = await resolveDependencies(graph, {
    requirePublic: row.is_public,
    dependencySnapshots: row.dependency_snapshots,
    getShadersByIds: services.getShadersByIds,
  });
  return { row, isComposition, graph, resolved };
}

function getPreparedEmbedPreview(route, services = {}) {
  if (Object.keys(services).length) return prepareEmbedPreview(route, services);
  const key = embedPreviewCacheKey(route);
  let pending = embedPreviewCache.get(key);
  if (!pending) {
    pending = prepareEmbedPreview(route).catch((error) => {
      embedPreviewCache.delete(key);
      throw error;
    });
    embedPreviewCache.set(key, pending);
  }
  return pending;
}

export function prefetchEmbedPreview(route) {
  return getPreparedEmbedPreview(route);
}

async function startEmbed(
  route,
  canvas,
  showError,
  services = {},
  {
    viewportElement = null,
    setTitle = true,
    respectDocumentVisibility = true,
  } = {},
) {
  const { row, isComposition, graph, resolved } =
    await getPreparedEmbedPreview(route, services);

  if (setTitle) document.title = row.name || "WebGPU Shader";
  if (!navigator.gpu) {
    throw new Error(
      "WebGPU is unavailable. Open this embed in a current WebGPU-capable browser."
    );
  }
  const resources = [];
  const Host = services.ShaderHost || ShaderHost;
  const host = new Host(canvas, { onError: showError });
  await host.init();
  const audioBus = new AudioInputBus();
  host.setAudioBus(audioBus);
  const viewportSize = () => {
    const rect = viewportElement?.getBoundingClientRect?.();
    return {
      width: Math.max(1, Math.round(rect?.width || window.innerWidth)),
      height: Math.max(1, Math.round(rect?.height || window.innerHeight)),
    };
  };
  const initialSize = viewportSize();
  host.setStageCssSize(initialSize.width, initialSize.height);
  host.setPointerSurface?.(canvas);
  let intersecting = true;
  let requestedActive = true;

  const resize = () => {
    const size = viewportSize();
    host.setStageCssSize(size.width, size.height);
  };
  const syncActivity = () => {
    const active =
      (!respectDocumentVisibility || document.visibilityState !== "hidden") &&
      intersecting &&
      requestedActive;
    host.setActive(active);
    for (const resource of resources) {
      if (typeof resource?.pause !== "function") continue;
      if (active) Promise.resolve(resource.play?.()).catch(() => {});
      else resource.pause();
    }
  };
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    intersecting = entry?.isIntersecting !== false;
    syncActivity();
  });
  intersectionObserver.observe(canvas);
  syncActivity();
  const resizeObserver = viewportElement
    ? new ResizeObserver(resize)
    : null;
  if (resizeObserver) resizeObserver.observe(viewportElement);
  else window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", syncActivity);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", syncActivity);
    window.removeEventListener("pagehide", cleanup);
    resizeObserver?.disconnect();
    intersectionObserver.disconnect();
    audioBus.dispose();
    host.destroy();
    for (const resource of resources) {
      if (typeof resource?.getTracks === "function") {
        resource.getTracks().forEach((track) => track.stop());
      } else {
        resource?.pause?.();
        resource?.close?.();
        resource?.remove?.();
      }
    }
  };
  window.addEventListener("pagehide", cleanup, { once: true });
  const controller = {
    destroy: cleanup,
    setActive(active) {
      requestedActive = Boolean(active);
      syncActivity();
    },
  };

  const bindAudioGesture = (supportsAudio, documentGraph) => {
    if (!supportsAudio) return;
    const start = async () => {
      canvas.removeEventListener("pointerdown", start);
      try {
        await audioBus.resume();
        const audioFile = enabledAudioFileInput(documentGraph?.inputs);
        if (audioFile?.audio?.url) {
          const el = document.createElement("audio");
          el.crossOrigin = "anonymous";
          const playback = audioPlaybackSettings(audioFile.audio);
          el.loop = playback.loop;
          el.preload = "auto";
          el.src = audioFile.audio.url;
          resources.push(el);
          await audioBus.attachElement(el, {
            gain: playback.gain,
            monitor: playback.monitor,
          });
          await audioBus.syncPlayback({ running: true });
          return;
        }
        if (enabledVideoFillSoundtrack(documentGraph)) {
          const videoEl = resources.find(
            (resource) =>
              resource?.tagName === "VIDEO" && resource.src && !resource.srcObject,
          );
          if (videoEl) await audioBus.attachElement(videoEl);
        }
      } catch {
        // Stay silent; frame.audio remains zeroed.
      }
    };
    canvas.addEventListener("pointerdown", start);
    resources.push({
      remove() {
        canvas.removeEventListener("pointerdown", start);
      },
    });
  };

  if (row.kind === "fill") {
    const loaded = loadModule(row.source);
    const features = mergeShaderFeatures(inferFeatures(row.source), row.features);
    host.setParams(mergeLayerValues(loaded.props, row.parameter_values || {}));
    const ok = await host.setModule(
      { setup: loaded.setup, render: loaded.render },
      {
        isFill: true,
        isAnimated: features.isAnimated || features.supportsAudio,
        usesMouse: features.usesMouse,
        supportsRenderScale: supportsRenderScale(row.source),
        supportsAudio: Boolean(features.supportsAudio),
      }
    );
    if (!ok) throw new Error("The shader could not be rendered.");
    if (features.isAnimated || features.usesMouse || features.supportsAudio) {
      host.start();
    }
    bindAudioGesture(Boolean(features.supportsAudio), row.composition);
    return controller;
  }

  const compositionResult = await setComposition(
    host,
    canvas,
    graph,
    resolved,
    isComposition
      ? null
      : {
          id: `cloud:${row.id}`,
          source: row.source,
          values: row.parameter_values || {},
          features: row.features,
        },
    resources
  );
  bindAudioGesture(
    Boolean(compositionResult?.supportsAudio || row.features?.supportsAudio),
    graph,
  );
  return controller;
}

export function mountEmbedPreview(route, canvas, onError = () => {}) {
  return startEmbed(route, canvas, onError, {}, {
    viewportElement: canvas,
    setTitle: false,
    respectDocumentVisibility: false,
  });
}

export function renderEmbedPage(route, services = {}) {
  document.open();
  document.write(EMBED_DOCUMENT);
  document.close();

  const canvas = document.querySelector("#shader");
  const loadingView = document.querySelector("#loading");
  const errorView = document.querySelector("#error");
  const showError = (error) => {
    if (!error) {
      errorView.style.display = "none";
      errorView.textContent = "";
      return;
    }
    loadingView.style.display = "none";
    errorView.style.display = "block";
    errorView.textContent = error?.stack || error?.message || String(error);
  };

  startEmbed(route, canvas, showError, services)
    .then(() => {
      loadingView.style.display = "none";
    })
    .catch(showError);
}
