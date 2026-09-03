import { useEffect, useRef, useState } from "react";

const DIALOG_ID = "view-properties-dialog";

export default function ViewPropertiesDialog({
  children,
  id = DIALOG_ID,
  label = "Properties",
}) {
  const [minimized, setMinimized] = useState(true);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.show();
  }, []);

  return (
    <div className="view-properties-overlay">
      <dialog
        is="fig-dialog"
        ref={dialogRef}
        id={id}
        class={`view-properties-dialog${minimized ? " is-minimized" : ""}`}
        aria-label={label}
        closedby="none"
        position="top right"
        onCancel={(event) => {
          if (event.target === event.currentTarget) event.preventDefault();
        }}
        onClose={(event) => {
          if (event.target !== event.currentTarget) return;
          requestAnimationFrame(() => {
            const dialog = dialogRef.current;
            if (dialog && !dialog.open) dialog.show();
          });
        }}
      >
        {children({
          minimized,
          toggle: () => setMinimized((current) => !current),
        })}
      </dialog>
    </div>
  );
}
