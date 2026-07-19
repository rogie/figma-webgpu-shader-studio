import { useCallback, useEffect, useRef, useState } from "react";
import CodePane from "./components/CodePane.jsx";
import Preview from "./components/Preview.jsx";
import Controls from "./components/Controls.jsx";
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import { buildDefaults, detectKind } from "./runtime/params.js";
import { makeSampleBitmap } from "./runtime/sample.js";
import { exportFigmaFiles } from "./runtime/exportFigma.js";
import { getPreset, PRESETS } from "./presets.js";

import logo from "./assets/logo.svg";
import iconMoon from "./assets/moon.svg";
import iconSun from "./assets/sun.svg";
import iconUpload from "./assets/upload.svg";

const INITIAL = getPreset("dither");
const THUMBNAIL_COLORS = [
  ["#1d3557", "#f1fa8c"],
  ["#5c2a72", "#ff8fab"],
  ["#023047", "#8ecae6"],
  ["#202020", "#d8d8d8"],
  ["#1b4332", "#95d5b2"],
  ["#3c096c", "#ff9e00"],
];

function thumbnailData(index, label) {
  const [from, to] = THUMBNAIL_COLORS[index % THUMBNAIL_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" rx="8" fill="url(#g)"/><circle cx="${18 + (index % 3) * 12}" cy="${20 + (index % 2) * 22}" r="${8 + index}" fill="rgba(255,255,255,.38)"/><text x="32" y="37" text-anchor="middle" font-family="system-ui" font-size="10" font-weight="700" fill="white">${label
    .slice(0, 2)
    .toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function Icon({ src, alt = "" }) {
  return <img className="fig-icon" src={src} alt={alt} />;
}

export default function App() {
  const [presetId, setPresetId] = useState(INITIAL.id);
  const [shaderName, setShaderName] = useState(INITIAL.name);
  const [source, setSource] = useState(INITIAL.source);
  const [props, setProps] = useState({});
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(false);
  const [background, setBackground] = useState("light");
  const [renaming, setRenaming] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [thumbnails, setThumbnails] = useState(() =>
    Object.fromEntries(
      PRESETS.map((preset, index) => [
        preset.id,
        thumbnailData(index, preset.name),
      ])
    )
  );

  const canvasRef = useRef(null);
  const chooserRef = useRef(null);
  const nameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const hostRef = useRef(null);
  const initedRef = useRef(false);
  const sourceRef = useRef(source);
  const compileTimer = useRef(0);
  const videoRef = useRef(null);
  const mediaUrlRef = useRef(null);

  sourceRef.current = source;
  const kind = detectKind(source);

  const compile = useCallback((nextSource) => {
    const host = hostRef.current;
    if (!host?.ready) return;

    let loaded;
    try {
      loaded = loadModule(nextSource);
    } catch (compileError) {
      setError(compileError.message);
      host.stop();
      setRunning(false);
      return;
    }

    const defaults = buildDefaults(loaded.props);
    setProps(loaded.props);
    setValues(defaults);
    host.setParams(defaults);

    host
      .setModule(
        { setup: loaded.setup, render: loaded.render },
        { isFill: detectKind(nextSource) === "fill" }
      )
      .then((ok) => {
        if (!ok) {
          setRunning(false);
          return;
        }
        host.start();
        setRunning(true);
      });
  }, []);

  const restoreSample = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.ready) return;
    const bitmap = await makeSampleBitmap();
    host.setImageInput(bitmap);
    setPreviewRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (initedRef.current || !canvasRef.current) return;
    initedRef.current = true;
    const host = new ShaderHost(canvasRef.current, { onError: setError });
    hostRef.current = host;

    (async () => {
      try {
        await host.init();
        await restoreSample();
        compile(sourceRef.current);
      } catch (initError) {
        setFatal(initError.message || String(initError));
      }
    })();
  }, [compile, restoreSample]);

  useEffect(() => {
    if (!hostRef.current?.ready) return;
    clearTimeout(compileTimer.current);
    compileTimer.current = setTimeout(() => compile(source), 350);
    return () => clearTimeout(compileTimer.current);
  }, [source, compile]);

  const updateControl = useCallback((name, value) => {
    setValues((current) => {
      const next = { ...current, [name]: value };
      hostRef.current?.setParams(next);
      return next;
    });
  }, []);

  const choosePreset = useCallback((id) => {
    const preset = getPreset(id);
    setPresetId(preset.id);
    setShaderName(preset.name);
    setSource(preset.source);
  }, []);

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser) return;

    const handleChange = (event) => {
      if (typeof event.detail === "string") {
        choosePreset(event.detail);
      }
    };
    chooser.addEventListener("change", handleChange);
    return () => chooser.removeEventListener("change", handleChange);
  }, [choosePreset]);

  const resetProperties = useCallback(() => {
    const defaults = buildDefaults(props);
    setValues(defaults);
    hostRef.current?.setParams(defaults);
  }, [props]);

  const startRename = useCallback(() => {
    setRenaming(true);
    requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.input?.select();
    });
  }, []);

  const finishRename = useCallback(() => {
    nameInputRef.current?.input?.blur();
    setRenaming(false);
  }, []);

  const togglePlay = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    if (running) {
      host.stop();
      setRunning(false);
    } else {
      host.start();
      setRunning(true);
    }
  }, [running]);

  const clearObjectUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
  }, []);

  const pickFile = useCallback(
    async (file) => {
      const host = hostRef.current;
      if (!host?.ready) return;
      clearObjectUrl();

      if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        const url = URL.createObjectURL(file);
        mediaUrlRef.current = url;
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        await new Promise((resolve, reject) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener("error", reject, { once: true });
        });
        await video.play();
        videoRef.current = video;
        host.setVideoInput(video);
      } else {
        const bitmap = await createImageBitmap(file);
        host.setImageInput(bitmap);
      }
      setPreviewRevision((revision) => revision + 1);
    },
    [clearObjectUrl]
  );

  const onFileInput = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        pickFile(file).catch((fileError) =>
          setError(fileError.message || String(fileError))
        );
      }
      event.target.value = "";
    },
    [pickFile]
  );

  const exportFiles = useCallback(() => {
    exportFigmaFiles(sourceRef.current, shaderName || "Shader");
  }, [shaderName]);

  useEffect(() => {
    let frameId = 0;
    const timer = window.setTimeout(() => {
      frameId = requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas?.width || !canvas?.height) return;

        try {
          const thumbnail = document.createElement("canvas");
          thumbnail.width = 64;
          thumbnail.height = 64;
          const context = thumbnail.getContext("2d");
          if (!context) return;

          context.fillStyle = "#d9d9d9";
          context.fillRect(0, 0, 64, 64);

          const scale = Math.max(
            64 / canvas.width,
            64 / canvas.height
          );
          const width = canvas.width * scale;
          const height = canvas.height * scale;
          context.drawImage(
            canvas,
            (64 - width) / 2,
            (64 - height) / 2,
            width,
            height
          );

          const dataUrl = thumbnail.toDataURL("image/webp", 0.82);
          setThumbnails((current) => ({
            ...current,
            [presetId]: dataUrl,
          }));
        } catch {
          // Keep the previous thumbnail if this browser cannot capture WebGPU.
        }
      });
    }, 600);

    return () => {
      window.clearTimeout(timer);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [source, values, presetId, previewRevision]);

  return (
    <>
      <nav className="app-nav">
        <img className="app-logo" src={logo} alt="shader.gl" />
        <fig-chooser
          ref={chooserRef}
          value={presetId}
          layout="vertical"
          drag="true"
          loop=""
        >
          {PRESETS.map((preset, index) => (
            <fig-choice
              key={preset.id}
              value={preset.id}
              aria-label={preset.name}
            >
              <fig-tooltip text={preset.name} delay="0">
                <fig-swatch
                  size="large"
                  background={`url("${
                    thumbnails[preset.id] ||
                    thumbnailData(index, preset.name)
                  }") center / cover no-repeat`}
                  aria-label={preset.name}
                />
              </fig-tooltip>
            </fig-choice>
          ))}
        </fig-chooser>
        <footer>
          <fig-menu position="top right">
            <fig-tooltip text="New Figma shader" delay="0">
              <fig-button
                fig-menu-trigger=""
                variant="ghost"
                icon="true"
                size="large"
                aria-label="New Figma shader"
              >
                <fig-icon name="add" />
              </fig-button>
            </fig-tooltip>
            <fig-menu-item
              value="effect"
              onClick={() => choosePreset("blank-effect")}
            >
              Shader effect
            </fig-menu-item>
            <fig-menu-item
              value="fill"
              onClick={() => choosePreset("blank-fill")}
            >
              Shader fill
            </fig-menu-item>
          </fig-menu>
        </footer>
      </nav>

      <main className="shader-viewer">
        <section className="shader-viewer-properties">
          <fig-header>
            <fig-input-text
              ref={nameInputRef}
              name="name"
              class="shader-name"
              value={shaderName}
              variant="editable"
              readonly={!renaming}
              onInput={(event) => setShaderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishRename();
              }}
            />
            {renaming ? (
              <fig-button
                variant="primary"
                icon="true"
                aria-label="Finish renaming"
                onClick={finishRename}
              >
                <fig-icon name="checkmark" size="small" />
              </fig-button>
            ) : (
              <fig-menu position="bottom right">
                <fig-tooltip text="More" delay="0">
                  <fig-button
                    fig-menu-trigger=""
                    variant="ghost"
                    icon="true"
                    aria-label="More shader actions"
                  >
                    <fig-icon name="more" />
                  </fig-button>
                </fig-tooltip>
                <fig-menu-item value="rename" onClick={startRename}>
                  Rename
                </fig-menu-item>
                <fig-menu-item value="reset" onClick={resetProperties}>
                  Reset properties
                </fig-menu-item>
                <fig-menu-separator />
                <fig-menu-item value="export" onClick={exportFiles}>
                  Export
                </fig-menu-item>
              </fig-menu>
            )}
          </fig-header>

          <div className="shader-viewer-properties-content">
            <Controls
              props={props}
              values={values}
              onChange={updateControl}
            />
          </div>

        </section>

        <section className="shader-viewer-code">
          <fig-header borderless>
            <h2>Shader code</h2>
          </fig-header>
          <div className="code-editor">
            <CodePane source={source} onSourceChange={setSource} />
          </div>
        </section>

        <section
          className={`shader-viewer-visualizer background--${background}`}
        >
          {fatal ? (
            <div className="fatal">{fatal}</div>
          ) : (
            <Preview
              canvasRef={canvasRef}
              error={error}
              onPickFile={(file) =>
                pickFile(file).catch((dropError) =>
                  setError(dropError.message || String(dropError))
                )
              }
              onDropError={setError}
            />
          )}

          <div
            className={`shader-viewer-visualizer-settings background--${background}`}
          >
            <fig-button variant="overlay" onClick={togglePlay}>
              {running ? "Pause" : "Play"}
            </fig-button>
            {kind === "effect" && (
              <fig-tooltip text="Upload input" delay="0">
                <fig-button
                  variant="overlay"
                  icon="true"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon src={iconUpload} />
                </fig-button>
              </fig-tooltip>
            )}
            <fig-tooltip
              text={`Use ${background === "dark" ? "light" : "dark"} background`}
              delay="0"
            >
              <fig-button
                variant="overlay"
                icon="true"
                onClick={() =>
                  setBackground((value) =>
                    value === "dark" ? "light" : "dark"
                  )
                }
              >
                <Icon src={background === "dark" ? iconMoon : iconSun} />
              </fig-button>
            </fig-tooltip>
          </div>
        </section>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={onFileInput}
        hidden
      />
    </>
  );
}
