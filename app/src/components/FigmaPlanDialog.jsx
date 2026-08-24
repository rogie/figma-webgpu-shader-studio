import { useEffect, useRef } from "react";

export default function FigmaPlanDialog({
  dialogRef,
  plans,
  value,
  loading = false,
  onChange,
  onCancel,
  onConfirm,
}) {
  const selectRef = useRef(null);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return undefined;
    const handleChange = (event) => {
      const next = event.detail?.value ?? event.detail ?? select.value;
      if (typeof next === "string") onChange?.(next);
    };
    select.addEventListener("input", handleChange);
    return () => select.removeEventListener("input", handleChange);
  }, [onChange]);

  const options = (plans || []).map((plan) => ({
    value: plan.key,
    label: `${plan.name}${plan.tier ? ` · ${plan.tier}` : ""}`,
  }));

  return (
    <dialog
      is="fig-dialog"
      ref={dialogRef}
      title="Create shader in Figma"
      modal=""
      closedby="closerequest"
      position="center center"
      autoresize=""
      onClose={onCancel}
      onCancel={onCancel}
    >
      <fig-content>
        <fig-field>
          <label>Plan</label>
          <fig-select
            ref={selectRef}
            value={value}
            options={JSON.stringify(options)}
            full=""
            position="bottom left"
            disabled={loading ? "" : undefined}
            dangerouslySetInnerHTML={{ __html: "" }}
          />
        </fig-field>
      </fig-content>
      <fig-footer>
        <fig-button
          type="button"
          variant="secondary"
          disabled={loading ? "" : undefined}
          onClick={onCancel}
        >
          Cancel
        </fig-button>
        <fig-button
          type="button"
          variant="primary"
          disabled={loading || !value ? "" : undefined}
          onClick={onConfirm}
        >
          Create
        </fig-button>
      </fig-footer>
    </dialog>
  );
}
