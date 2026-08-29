import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  groupVersionsByDay,
  versionRowParts,
} from "../lib/shaderVersions.js";
import { portalToFigOverlay } from "../lib/figOverlay.js";
import { useFigMenuChange } from "../hooks/useFigMenuChange.js";
import { visibleVersionHistory } from "../lib/versionHistory.js";
import "./ShaderVersionSelect.css";

const opaqueContent = { __html: "" };
const PENDING_VALUE = "__pending";

function readVersionMenuItem(node) {
  if (!(node instanceof Element)) return null;
  const item = node.closest("fig-menu-item.shader-version-menu-item");
  if (!item || item.hasAttribute("disabled")) return null;
  const versionId = item.getAttribute("value");
  if (!versionId || versionId === PENDING_VALUE) return null;
  return versionId;
}

function selectState({ saving, dirty, hasUncheckpointedChanges, versions }) {
  if (saving) return { value: "__saving", label: "Saving…" };
  if (dirty) return { value: "__unsaved", label: "Unsaved" };
  if (hasUncheckpointedChanges) return { value: "__autosaved", label: "Autosave" };
  const number = Number(versions[0]?.version_number || 0);
  if (!number) return { value: "", label: "History" };
  return { value: String(versions[0].id), label: `Version ${number}` };
}

function tooltipText({ saving, dirty, hasUncheckpointedChanges }) {
  if (saving) return "Saving a new version…";
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
  onDuplicate,
}) {
  const trailingInteractive = Boolean(time && !current);
  const versionMenuRef = useFigMenuChange((value) => {
    if (value === "restore") onRestore?.();
    if (value === "duplicate") onDuplicate?.();
  });

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
              <fig-menu
                ref={versionMenuRef}
                class="shader-version-item-menu"
                position="bottom right"
              >
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
                <fig-menu-item value="restore">
                  Restore this version
                </fig-menu-item>
                <fig-menu-item value="duplicate">Duplicate</fig-menu-item>
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
  versionsHasMore = false,
  dirty = false,
  hasUncheckpointedChanges = false,
  saving = false,
  disabled = false,
  onOpen,
  onLoadMore,
  onPreviewVersion,
  onChange,
  onDuplicate,
}) {
  const selectRef = useRef(null);
  const popupRef = useRef(null);
  const hoveredVersionRef = useRef(null);
  const [open, setOpen] = useState(false);
  const groups = useMemo(
    () => groupVersionsByDay(visibleVersionHistory(versions, open)),
    [open, versions],
  );
  const pending = pendingRow({ dirty, hasUncheckpointedChanges });
  const currentVersionId = pending ? null : versions[0]?.id || null;
  const { value: selectValue, label: selectLabel } = selectState({
    saving,
    dirty,
    hasUncheckpointedChanges,
    versions,
  });
  const selectOptions = useMemo(
    () => JSON.stringify([{ value: selectValue, label: selectLabel }]),
    [selectLabel, selectValue]
  );

  useEffect(() => {
    if (open) onOpen?.();
  }, [onOpen, open]);

  const clearPreview = useCallback(() => {
    onPreviewVersion?.(null);
  }, [onPreviewVersion]);

  const closePopup = useCallback(() => {
    clearPreview();
    setOpen(false);
  }, [clearPreview]);

  const previewVersion = useCallback(
    (versionId) => {
      onPreviewVersion?.(versionId);
    },
    [onPreviewVersion]
  );

  useEffect(() => {
    if (!open) {
      hoveredVersionRef.current = null;
      return undefined;
    }

    const popup = popupRef.current;
    const content = popup?.querySelector("fig-content");
    if (!content) return undefined;

    const previewHoveredItem = (event) => {
      const versionId = readVersionMenuItem(event.target);
      if (!versionId || versionId === hoveredVersionRef.current) return;
      hoveredVersionRef.current = versionId;
      previewVersion(versionId);
    };

    const restoreWhenLeavingList = (event) => {
      const related = event.relatedTarget;
      if (related instanceof Node && content.contains(related)) return;
      hoveredVersionRef.current = null;
      clearPreview();
    };

    content.addEventListener("pointerover", previewHoveredItem);
    content.addEventListener("pointerleave", restoreWhenLeavingList);
    return () => {
      content.removeEventListener("pointerover", previewHoveredItem);
      content.removeEventListener("pointerleave", restoreWhenLeavingList);
    };
  }, [clearPreview, open, previewVersion]);

  const getSelectTrigger = useCallback(() => {
    return selectRef.current?.shadowRoot?.querySelector(".fig-select-trigger");
  }, []);

  useEffect(() => {
    const popup = popupRef.current;
    const trigger = getSelectTrigger();
    if (!popup) return;
    if (open) {
      popup.open = true;
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.setAttribute("aria-haspopup", "dialog");
    } else {
      popup.open = false;
      trigger?.setAttribute("aria-expanded", "false");
    }
  }, [getSelectTrigger, open]);

  useEffect(() => {
    if (disabled) closePopup();
  }, [closePopup, disabled]);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;

    const openHistory = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (select.open) select.open = false;
      if (disabled) return;
      if (open) {
        closePopup();
        return;
      }
      setOpen(true);
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
  }, [closePopup, disabled, getSelectTrigger, open, selectOptions]);

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
      <fig-tooltip
        text={tooltipText({ saving, dirty, hasUncheckpointedChanges })}
      >
        <fig-select
          ref={selectRef}
          class="shader-version-select"
          variant="ghost"
          aria-label={saving ? "Saving version" : "Shader version history"}
          value={selectValue}
          label={selectLabel}
          options={selectOptions}
          id="shader-version-select"
          disabled={disabled ? "" : undefined}
          dangerouslySetInnerHTML={opaqueContent}
        />
      </fig-tooltip>

      {open && portalToFigOverlay(
        <dialog
          is="fig-popup"
          ref={popupRef}
          class="shader-version-popup"
          position="bottom right"
          popover="manual"
          closedby="any"
          anchor="#shader-version-select"
          onClose={closePopup}
          onCancel={closePopup}
        >
        <fig-header>
          <h3>Version history</h3>
        </fig-header>
        <fig-content>
          {pending && (
            <>
              <fig-separator label="Now" sticky="" />
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
            </>
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
            <Fragment key={group.key}>
              <fig-separator label={group.label} sticky="" />
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
                  >
                    <VersionMenuItem
                      title={title}
                      time={time}
                      subtitle={subtitle}
                      versionNumber={version.version_number}
                      current={current}
                      onRestore={() => restore(version.id)}
                      onDuplicate={() => {
                        closePopup();
                        onDuplicate?.(version.id);
                      }}
                    />
                  </fig-menu-item>
                );
              })}
            </Fragment>
          ))}
          {versionsHasMore && (
            <fig-button
              variant="secondary"
              disabled={versionsLoading ? "" : undefined}
              onClick={() => onLoadMore?.()}
            >
              {versionsLoading ? "Loading…" : "Load older versions"}
            </fig-button>
          )}
        </fig-content>
        </dialog>
      )}
    </>
  );
}
