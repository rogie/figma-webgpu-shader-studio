import { useCallback, useEffect, useRef, useState } from "react";
import AccountMenu from "./components/AccountMenu.jsx";
import CodePane from "./components/CodePane.jsx";
import Controls from "./components/Controls.jsx";
import Preview from "./components/Preview.jsx";
import { useAuth } from "./contexts/AuthContext.jsx";
import { getPreset, PRESETS } from "./presets.js";
import { exportFigmaFiles } from "./runtime/exportFigma.js";
import { ShaderHost } from "./runtime/host.js";
import { loadModule } from "./runtime/loader.js";
import {
  buildDefaults,
  detectKind,
  inferFeatures,
} from "./runtime/params.js";
import { makeSampleBitmap } from "./runtime/sample.js";
import {
  createShader,
  deleteShader,
  downloadAsset,
  getAssetUrl,
  getShader,
  listShaders,
  makeShareUrl,
  MAX_MEDIA_BYTES,
  removeAssets,
  updateShader,
  uploadAsset,
} from "./services/shaders.js";

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

function mergeValues(definitions, candidate = {}) {
  const defaults = buildDefaults(definitions);
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(candidate, key)) {
      defaults[key] = candidate[key];
    }
  }
  return defaults;
}

function cloudChoiceId(id) {
  return `cloud:${id}`;
}

function mediaType(file) {
  if (file.type?.startsWith("image/") || file.type?.startsWith("video/")) {
    return file.type;
  }
  const extension = file.name?.split(".").pop()?.toLowerCase();
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
  }[extension];
}

export default function App() {
  const { user } = useAuth();
  const [presetId, setPresetId] = useState(INITIAL.id);
  const [shaderName, setShaderName] = useState(INITIAL.name);
  const [source, setSource] = useState(INITIAL.source);
  const [props, setProps] = useState({});
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null);
  const [running, setRunning] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [background, setBackground] = useState("light");
  const [renaming, setRenaming] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [cloudShaders, setCloudShaders] = useState([]);
  const [currentShader, setCurrentShader] = useState(null);
  const [cloudThumbnails, setCloudThumbnails] = useState({});
  const [pendingMedia, setPendingMedia] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [isPublic, setIsPublic] = useState(false);
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
  const valuesRef = useRef(values);
  const pendingValuesRef = useRef(null);
  const compileTimer = useRef(0);
  const videoRef = useRef(null);
  const mediaUrlRef = useRef(null);
  const sharedLoadedRef = useRef(false);

  sourceRef.current = source;
  valuesRef.current = values;
  const kind = detectKind(source);
  const isOwner = Boolean(user && currentShader?.owner_id === user.id);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const setRuntimeValues = useCallback((next) => {
    valuesRef.current = next;
    setValues(next);
    hostRef.current?.setParams(next);
  }, []);

  const compile = useCallback(
    (nextSource) => {
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

      const preferred = pendingValuesRef.current ?? valuesRef.current;
      pendingValuesRef.current = null;
      const nextValues = mergeValues(loaded.props, preferred);
      setProps(loaded.props);
      setRuntimeValues(nextValues);
      setError(null);

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
    },
    [setRuntimeValues]
  );

  const clearObjectUrl = useCallback(() => {
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current = null;
    }
  }, []);

  const applyMediaBlob = useCallback(
    async (blob, mimeType = blob.type) => {
      const host = hostRef.current;
      if (!host?.ready) return;
      clearObjectUrl();

      if (mimeType.startsWith("video/")) {
        const video = document.createElement("video");
        const url = URL.createObjectURL(blob);
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
        const bitmap = await createImageBitmap(blob);
        host.setImageInput(bitmap);
      }
      setPreviewRevision((revision) => revision + 1);
    },
    [clearObjectUrl]
  );

  const restoreSample = useCallback(async () => {
    const host = hostRef.current;
    if (!host?.ready) return;
    clearObjectUrl();
    const bitmap = await makeSampleBitmap();
    host.setImageInput(bitmap);
    setPreviewRevision((revision) => revision + 1);
  }, [clearObjectUrl]);

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
        setRuntimeReady(true);
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

  useEffect(
    () => () => {
      clearObjectUrl();
      hostRef.current?.destroy?.();
    },
    [clearObjectUrl]
  );

  const loadMediaForShader = useCallback(
    async (shader) => {
      if (shader.kind !== "effect") {
        clearObjectUrl();
        hostRef.current?.clearInput();
        return;
      }
      if (!shader.input_path) {
        await restoreSample();
        return;
      }
      setUploading(true);
      try {
        const blob = await downloadAsset(shader.input_path);
        await applyMediaBlob(blob, shader.input_mime_type || blob.type);
      } finally {
        setUploading(false);
      }
    },
    [applyMediaBlob, clearObjectUrl, restoreSample]
  );

  const openCloudShader = useCallback(
    async (shader) => {
      pendingValuesRef.current = shader.parameter_values || {};
      setRuntimeValues(shader.parameter_values || {});
      setCurrentShader(shader);
      setPresetId(cloudChoiceId(shader.id));
      setShaderName(shader.name);
      setSource(shader.source);
      setIsPublic(shader.is_public);
      setPendingMedia(null);
      setDirty(false);
      setError(null);
      if (runtimeReady) {
        try {
          await loadMediaForShader(shader);
        } catch (mediaError) {
          setError(mediaError.message || String(mediaError));
        }
      }
    },
    [loadMediaForShader, runtimeReady, setRuntimeValues]
  );

  const refreshLibrary = useCallback(async () => {
    if (!user) {
      setCloudShaders([]);
      setCloudThumbnails({});
      return;
    }
    try {
      const shaders = await listShaders(user.id);
      setCloudShaders(shaders);
      const entries = await Promise.all(
        shaders.map(async (shader) => {
          if (!shader.thumbnail_path) return [shader.id, null];
          try {
            return [shader.id, await getAssetUrl(shader.thumbnail_path)];
          } catch {
            return [shader.id, null];
          }
        })
      );
      setCloudThumbnails(Object.fromEntries(entries));
    } catch (libraryError) {
      setError(libraryError.message || String(libraryError));
    }
  }, [user]);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (!runtimeReady || sharedLoadedRef.current) return;
    const sharedId = new URLSearchParams(window.location.search).get("shader");
    if (!sharedId) return;
    sharedLoadedRef.current = true;
    getShader(sharedId)
      .then(openCloudShader)
      .catch(() => setError("This shader is private, missing, or unavailable."));
  }, [openCloudShader, runtimeReady]);

  const choosePreset = useCallback(
    async (id) => {
      const preset = getPreset(id);
      pendingValuesRef.current = {};
      setRuntimeValues({});
      setCurrentShader(null);
      setPresetId(preset.id);
      setShaderName(preset.name);
      setSource(preset.source);
      setIsPublic(false);
      setPendingMedia(null);
      setDirty(false);
      window.history.replaceState({}, "", window.location.pathname);
      if (hostRef.current?.ready) {
        if (preset.kind === "effect") await restoreSample();
        else hostRef.current.clearInput();
      }
    },
    [restoreSample, setRuntimeValues]
  );

  const chooseItem = useCallback(
    (id) => {
      if (id.startsWith("cloud:")) {
        const shader = cloudShaders.find(
          (item) => item.id === id.slice("cloud:".length)
        );
        if (shader) openCloudShader(shader);
      } else {
        choosePreset(id).catch((presetError) =>
          setError(presetError.message || String(presetError))
        );
      }
    },
    [choosePreset, cloudShaders, openCloudShader]
  );

  useEffect(() => {
    const chooser = chooserRef.current;
    if (!chooser) return;
    const handleChange = (event) => {
      if (typeof event.detail === "string") chooseItem(event.detail);
    };
    chooser.addEventListener("change", handleChange);
    return () => chooser.removeEventListener("change", handleChange);
  }, [chooseItem]);

  const updateControl = useCallback(
    (name, value) => {
      setRuntimeValues({ ...valuesRef.current, [name]: value });
      setDirty(true);
    },
    [setRuntimeValues]
  );

  const resetProperties = useCallback(() => {
    setRuntimeValues(buildDefaults(props));
    setDirty(true);
  }, [props, setRuntimeValues]);

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

  const pickFile = useCallback(
    async (file) => {
      if (file.size > MAX_MEDIA_BYTES) {
        throw new Error("Input media must be 25 MB or smaller.");
      }
      const mimeType = mediaType(file);
      if (!mimeType) {
        throw new Error("Choose a supported image or video file.");
      }
      setUploading(true);
      try {
        await applyMediaBlob(file, mimeType);
        setPendingMedia(file);
        setDirty(true);
      } finally {
        setUploading(false);
      }
    },
    [applyMediaBlob]
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

  const saveShader = useCallback(async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        owner_id: user.id,
        name: shaderName.trim() || "Untitled Shader",
        source: sourceRef.current,
        kind: detectKind(sourceRef.current),
        parameter_values: valuesRef.current,
        features: inferFeatures(sourceRef.current),
        is_public: isPublic,
      };

      let saved =
        isOwner && currentShader
          ? await updateShader(currentShader.id, payload)
          : await createShader(payload);

      const assetChanges = {};
      if (pendingMedia) {
        const oldPath = isOwner ? currentShader?.input_path : null;
        const inputMimeType = mediaType(pendingMedia);
        const inputPath = await uploadAsset({
          ownerId: user.id,
          shaderId: saved.id,
          role: "input",
          blob: pendingMedia,
          fileName: pendingMedia.name,
          contentType: inputMimeType,
        });
        if (oldPath && oldPath !== inputPath) await removeAssets([oldPath]);
        assetChanges.input_path = inputPath;
        assetChanges.input_name = pendingMedia.name;
        assetChanges.input_mime_type = inputMimeType;
      }

      const thumbnail = thumbnails[presetId];
      if (thumbnail?.startsWith("data:image/webp")) {
        const thumbnailBlob = await fetch(thumbnail).then((response) =>
          response.blob()
        );
        assetChanges.thumbnail_path = await uploadAsset({
          ownerId: user.id,
          shaderId: saved.id,
          role: "thumbnail",
          blob: thumbnailBlob,
          fileName: "thumbnail.webp",
          contentType: "image/webp",
        });
      }

      if (Object.keys(assetChanges).length) {
        saved = await updateShader(saved.id, assetChanges);
      }

      setCurrentShader(saved);
      setPresetId(cloudChoiceId(saved.id));
      setPendingMedia(null);
      setDirty(false);
      setCloudShaders((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      if (saved.thumbnail_path) {
        const url = await getAssetUrl(saved.thumbnail_path);
        setCloudThumbnails((current) => ({ ...current, [saved.id]: url }));
      }
      showNotice("Shader saved");
    } catch (saveError) {
      setError(saveError.message || String(saveError));
    } finally {
      setSaving(false);
    }
  }, [
    currentShader,
    isOwner,
    isPublic,
    pendingMedia,
    presetId,
    shaderName,
    showNotice,
    thumbnails,
    user,
  ]);

  const duplicateShader = useCallback(async () => {
    let mediaFile = pendingMedia;
    if (!mediaFile && currentShader?.input_path) {
      try {
        const blob = await downloadAsset(currentShader.input_path);
        mediaFile = new File(
          [blob],
          currentShader.input_name || "input",
          { type: currentShader.input_mime_type || blob.type }
        );
      } catch {
        mediaFile = null;
      }
    }
    setCurrentShader(null);
    setPresetId(`copy:${crypto.randomUUID()}`);
    setShaderName(`${shaderName} Copy`);
    setIsPublic(false);
    setPendingMedia(mediaFile);
    setDirty(true);
    showNotice("Unsaved copy created");
  }, [currentShader, pendingMedia, shaderName, showNotice]);

  const removeCurrentShader = useCallback(async () => {
    if (!isOwner || !currentShader) return;
    if (!window.confirm(`Delete “${currentShader.name}”?`)) return;
    try {
      await removeAssets([
        currentShader.input_path,
        currentShader.thumbnail_path,
      ]);
      await deleteShader(currentShader.id);
      setCloudShaders((current) =>
        current.filter((item) => item.id !== currentShader.id)
      );
      await choosePreset("dither");
      showNotice("Shader deleted");
    } catch (deleteError) {
      setError(deleteError.message || String(deleteError));
    }
  }, [choosePreset, currentShader, isOwner, showNotice]);

  const copyShareLink = useCallback(async () => {
    if (!currentShader || dirty) {
      showNotice("Save the shader before sharing");
      return;
    }
    if (!currentShader.is_public) {
      showNotice("Make the shader public before sharing");
      return;
    }
    await navigator.clipboard.writeText(makeShareUrl(currentShader.id));
    showNotice("Share link copied");
  }, [currentShader, dirty, showNotice]);

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
          const scale = Math.max(64 / canvas.width, 64 / canvas.height);
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
          setThumbnails((current) => ({ ...current, [presetId]: dataUrl }));
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
        <img className="app-logo" src={logo} alt="Shader Studio" />
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
                  background={`url("${thumbnails[preset.id] || thumbnailData(index, preset.name)}") center / cover no-repeat`}
                  aria-label={preset.name}
                />
              </fig-tooltip>
            </fig-choice>
          ))}
          {cloudShaders.map((shader, index) => (
            <fig-choice
              key={shader.id}
              value={cloudChoiceId(shader.id)}
              aria-label={shader.name}
            >
              <fig-tooltip text={shader.name} delay="0">
                <fig-swatch
                  size="large"
                  background={`url("${cloudThumbnails[shader.id] || thumbnailData(PRESETS.length + index, shader.name)}") center / cover no-repeat`}
                  aria-label={shader.name}
                />
              </fig-tooltip>
            </fig-choice>
          ))}
        </fig-chooser>
        <footer className="app-nav-actions">
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
          <AccountMenu open={authOpen} onOpenChange={setAuthOpen} />
        </footer>
      </nav>

      <main className="shader-viewer">
        <section className="shader-viewer-properties">
          <fig-header>
            <div className="shader-title">
              <fig-input-text
                ref={nameInputRef}
                name="name"
                class="shader-name"
                value={shaderName}
                variant="editable"
                readonly={!renaming}
                onInput={(event) => {
                  setShaderName(event.target.value);
                  setDirty(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") finishRename();
                }}
              />
              <span className="document-status">
                {saving ? "Saving…" : dirty ? "Unsaved" : currentShader ? "Saved" : "Local"}
              </span>
            </div>
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
              <hstack>
                <fig-button
                  variant="primary"
                  disabled={saving || Boolean(currentShader && !dirty)}
                  onClick={saveShader}
                >
                  {saving ? "Saving…" : "Save"}
                </fig-button>
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
                  <fig-menu-item value="duplicate" onClick={duplicateShader}>
                    Duplicate
                  </fig-menu-item>
                  <fig-menu-item value="share" onClick={copyShareLink}>
                    Copy share link
                  </fig-menu-item>
                  {isOwner && (
                    <fig-menu-item value="delete" onClick={removeCurrentShader}>
                      Delete
                    </fig-menu-item>
                  )}
                  <fig-menu-separator />
                  <fig-menu-item value="export" onClick={exportFiles}>
                    Export
                  </fig-menu-item>
                </fig-menu>
              </hstack>
            )}
          </fig-header>

          <div className="shader-viewer-properties-content">
            <Controls
              props={props}
              values={values}
              onChange={updateControl}
            />
            {user && (
              <div className="sharing-controls">
                <fig-field label="Public" direction="horizontal">
                  <fig-switch
                    checked={isPublic}
                    onInput={(event) => {
                      setIsPublic(event.target.checked);
                      setDirty(true);
                    }}
                  />
                </fig-field>
                <p>
                  {isPublic
                    ? "Anyone with the link can view the source and input."
                    : "Only you can open this cloud shader."}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="shader-viewer-code">
          <fig-header borderless>
            <h2>Shader code</h2>
          </fig-header>
          <div className="code-editor">
            <CodePane
              source={source}
              onSourceChange={(nextSource) => {
                setSource(nextSource);
                setDirty(true);
              }}
            />
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
              uploading={uploading}
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
                  disabled={uploading}
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

      {notice && <div className="status-toast">{notice}</div>}
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
