import { useState } from "react";

export default function Preview({
  canvasRef,
  error,
  onPickFile,
  onDropError,
}) {
  const [dragging, setDragging] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;

    const isMedia =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      /\.(png|jpe?g|webp|gif|avif|mp4|mov|m4v|webm)$/i.test(file.name);
    if (!isMedia) {
      onDropError?.("Drop an image or video file.");
      return;
    }
    onPickFile(file);
  };

  return (
    <div
      className={`canvas-stage${dragging ? " is-dragging" : ""}`}
      onDrop={onDrop}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
    >
      <canvas ref={canvasRef} className="preview-canvas" />
      {dragging && (
        <div className="drop-overlay">
          <fig-icon name="add" />
          <strong>Drop image or video</strong>
          <span>Use it as the shader input</span>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <div className="error-title">Shader error</div>
          <pre className="error-body">{error}</pre>
        </div>
      )}
    </div>
  );
}
