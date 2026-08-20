import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  groupVersionsByDay,
  versionRowParts,
} from "../lib/shaderVersions.js";
import "./ShaderVersionSelect.css";

const opaqueContent = { __html: "" };
const PENDING_VALUE = "__pending";
const PREVIEW_CLEAR_MS = 50;

function selectState({ dirty, hasUncheckpointedChanges, versions }) {
  if (dirty) return { value: "__unsaved", label: "Unsaved" };
  if (hasUncheckpointedChanges) return { value: "__autosaved", label: "Autosave" };
  const number = Number(versions[0]?.version_number || 0);
  if (!number) return { value: "", label: "History" };
  return { value: String(versions[0].id), label: `Version ${number}` };
}

function tooltipText({ dirty, hasUncheckpointedChanges }) {
  if (dirty) return "Unsaved changes are not yet in version history.";
  if (hasUncheckpointedChanges) {
    return "Autosaved to the cloud, but not yet saved as a restorable version.";
  }
  return "Shader version history";
}

function pendingRow({ dirty, hasUncheckpointedChanges }) {
  if (dirty) {
    return { title: "Unsaved changes", subtitle: "Not in version history" };
  }
  if (hasUncheckpointedChanges) {
    return { title: "Autosave", subtitle: "Not in version history" };
  }
  return null;
}

function VersionMenuItem({
  title,
  time,
  subtitle,
  versionNumber,
  current,
  onRestore,
}) {
  const trailingInteractive = Boolean(time && !current);

  return (
    <div className="shader-version-item">
      <h3 className="shader-version-item-label">{title}</h3>
      {time ? (
        <div
          className={
            trailingInteractive
              ? "shader-version-item-trailing shader-version-item-trailing--interactive"
              : "shader-version-item-trailing"
          }
        >
          <span className="shader-version-item-time">{time}</span>
          {!current && (
            <div className="shader-version-item-actions">
              <fig-menu class="shader-version-item-menu" position="bottom right">
                <fig-button
                  fig-menu-trigger=""
                  variant="ghost"
                  icon="true"
                  aria-label={`More actions for Version ${versionNumber}`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                >
                  <fig-icon name="more" />
                </fig-button>
                <fig-menu-item
                  value="restore"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestore?.();
                  }}
                >
                  Restore this version
                </fig-menu-item>
              </fig-menu>
            </div>
          )}
        </div>
      ) : null}
      {subtitle ? (
        <span className="shader-version-item-sublabel">{subtitle}</span>
      ) : null}
    </div>
  );
}

export default function ShaderVersionSelect({
  versions = [],
  versionsLoading = false,
  dirty = false,
  hasUncheckpointedChanges = false,
  disabled = false,
  onPreviewVersion,
  onChange,
}) {
  const selectRef = useRef(null);
  const popupRef = useRef(null);
  const previewClearTimerRef = useRef(0);
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupVersionsByDay(versions), [versions]);
  const pending = pendingRow({ dirty, hasUncheckpointedChanges });
  const currentVersionId = pending ? null : versions[0]?.id || null;
  const { value: selectValue, label: selectLabel } = selectState({
    dirty,
    hasUncheckpointedChanges,
    versions,
  });
  const selectOptions = useMemo(
    () => JSON.stringify([{ value: selectValue, label: selectLabel }]),
    [selectLabel, selectValue]
  );

  const clearPreview = useCallback(() => {
    window.clearTimeout(previewClearTimerRef.current);
    onPreviewVersion?.(null);
  }, [onPreviewVersion]);

  const closePopup = useCallback(() => {
    clearPreview();
    setOpen(false);
  }, [clearPreview]);

  const schedulePreviewClear = useCallback(() => {
    window.clearTimeout(previewClearTimerRef.current);
    previewClearTimerRef.current = window.setTimeout(() => {
      onPreviewVersion?.(null);
    }, PREVIEW_CLEAR_MS);
  }, [onPreviewVersion]);

  const previewVersion = useCallback(
    (versionId) => {
      window.clearTimeout(previewClearTimerRef.current);
      onPreviewVersion?.(versionId);
    },
    [onPreviewVersion]
  );

  const getSelectTrigger = useCallback(() => {
    return selectRef.current?.shadowRoot?.querySelector(".fig-select-trigger");
  }, []);

  useEffect(() => {
    const select = selectRef.current;
    const popup = popupRef.current;
    const trigger = getSelectTrigger();
    if (!popup) return;
    if (open) {
      popup.anchor = trigger || select;
      popup.open = true;
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.setAttribute("aria-haspopup", "dialog");
    } else {
      popup.open = false;
      trigger?.setAttribute("aria-expanded", "false");
    }
  }, [getSelectTrigger, open]);

  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    const root =
      document.body.querySelector("[data-figui-overlay-root]") ?? document.body;
    if (popup.parentElement !== root) root.append(popup);
  }, []);

  useEffect(() => {
    if (disabled) closePopup();
  }, [closePopup, disabled]);

  useEffect(
    () => () => {
      window.clearTimeout(previewClearTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;

    const openHistory = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (select.open) select.open = false;
      if (disabled) return;
      setOpen((value) => !value);
    };

    const onKeydown = (event) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }
      openHistory(event);
    };

    const trigger = getSelectTrigger();
    trigger?.addEventListener("click", openHistory, true);
    trigger?.addEventListener("keydown", onKeydown, true);

    const keepSelectClosed = () => {
      if (select.open) select.open = false;
    };
    const observer = new MutationObserver(keepSelectClosed);
    observer.observe(select, { attributes: true, attributeFilter: ["open"] });

    return () => {
      trigger?.removeEventListener("click", openHistory, true);
      trigger?.removeEventListener("keydown", onKeydown, true);
      observer.disconnect();
    };
  }, [disabled, getSelectTrigger, selectOptions]);

  const restore = useCallback(
    (versionId) => {
      closePopup();
      if (
        !versionId ||
        versionId === currentVersionId ||
        versionId === PENDING_VALUE
      ) {
        return;
      }
      const select = selectRef.current;
      const restored = versions.find((version) => version.id === versionId);
      if (select && restored) {
        const number = Number(restored.version_number || 0);
        const label = number ? `Version ${number}` : "History";
        select.value = String(versionId);
        select.setAttribute("label", label);
      }
      onChange?.(String(versionId));
    },
    [closePopup, currentVersionId, onChange, versions]
  );

  return (
    <>
      <fig-tooltip text={tooltipText({ dirty, hasUncheckpointedChanges })}>
        <fig-select
          ref={selectRef}
          class="shader-version-select"
          aria-label="Shader version history"
          value={selectValue}
          label={selectLabel}
          options={selectOptions}
          disabled={disabled ? "" : undefined}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-tooltip>

      <dialog
        is="fig-popup"
        ref={popupRef}
        class="shader-version-popup"
        popover="manual"
        position="bottom right"
        offset="8 0"
        variant="popover"
        closedby="any"
        onClose={closePopup}
        onCancel={closePopup}
      >
        <fig-header>
          <h3>Version history</h3>
        </fig-header>
        <fig-content
          onPointerLeave={clearPreview}
        >
          {pending && (
            <fig-group name="Now">
              <fig-menu-item
                class="shader-version-menu-item"
                value={PENDING_VALUE}
                disabled=""
                subtle=""
              >
                <VersionMenuItem
                  title={pending.title}
                  subtitle={pending.subtitle}
                />
              </fig-menu-item>
            </fig-group>
          )}
          {versionsLoading && versions.length === 0 && (
            <div className="shader-version-empty">
              <fig-spinner></fig-spinner>
              <span>Loading versions…</span>
            </div>
          )}
          {!versionsLoading && versions.length === 0 && (
            <div className="shader-version-empty">
              <span>No saved versions yet.</span>
            </div>
          )}
          {groups.map((group) => (
            <fig-group key={group.key} name={group.label}>
              {group.versions.map((version) => {
                const current = version.id === currentVersionId;
                const { title, time, subtitle, fullDate } = versionRowParts(
                  version,
                  { current }
                );
                return (
                  <fig-menu-item
                    class="shader-version-menu-item"
                    key={version.id}
                    value={version.id}
                    selected={current ? "" : undefined}
                    subtle=""
                    title={fullDate || undefined}
                    onPointerEnter={() => previewVersion(version.id)}
                    onPointerLeave={schedulePreviewClear}
                  >
                    <VersionMenuItem
                      title={title}
                      time={time}
                      subtitle={subtitle}
                      versionNumber={version.version_number}
                      current={current}
                      onRestore={() => restore(version.id)}
                    />
                  </fig-menu-item>
                );
              })}
            </fig-group>
          ))}
        </fig-content>
      </dialog>
    </>
  );
}
