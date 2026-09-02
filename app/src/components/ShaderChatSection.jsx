import { lazy, Suspense } from "react";
import TrashIcon from "./TrashIcon.jsx";

const ChatPane = lazy(() => import("./ChatPane.jsx"));

export default function ShaderChatSection({
  collapsed,
  onCollapsedChange,
  canClear,
  chatPaneRef,
  sourceRef,
  kind,
  fileName,
  shaderKey,
  planOwnerId,
  planShaderId,
  featuresRef,
  experimentalAudioRef,
  compileErrorRef,
  user,
  onApplySource,
  onAppliedCheckpoint,
  onOpenSettings,
  onNotice,
  onCanClearChange,
}) {
  return (
    <section
      className="shader-viewer-chat"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <fig-header borderless aria-expanded={!collapsed}>
        <h3>AI chat</h3>
        <hstack>
          {!collapsed && (
            <fig-tooltip text="Clear chat">
              <fig-button
                type="button"
                variant="ghost"
                icon="true"
                aria-label="Clear chat"
                disabled={!canClear}
                onClick={() => chatPaneRef.current?.clearChat()}
              >
                <TrashIcon />
              </fig-button>
            </fig-tooltip>
          )}
          <fig-tooltip text={collapsed ? "Expand AI chat" : "Collapse AI chat"}>
            <fig-button
              type="button"
              variant="ghost"
              icon="true"
              aria-label={collapsed ? "Expand AI chat" : "Collapse AI chat"}
              onClick={() => onCollapsedChange(!collapsed)}
            >
              <fig-icon
                class={
                  collapsed
                    ? "section-chevron is-collapsed"
                    : "section-chevron"
                }
                name="chevron"
                size="medium"
              />
            </fig-button>
          </fig-tooltip>
        </hstack>
      </fig-header>
      <Suspense fallback={null}>
        <ChatPane
          ref={chatPaneRef}
          sourceRef={sourceRef}
          kind={kind}
          fileName={fileName}
          shaderKey={shaderKey}
          planOwnerId={planOwnerId}
          planShaderId={planShaderId}
          featuresRef={featuresRef}
          experimentalAudioRef={experimentalAudioRef}
          compileErrorRef={compileErrorRef}
          user={user}
          onApplySource={onApplySource}
          onAppliedCheckpoint={onAppliedCheckpoint}
          onOpenSettings={onOpenSettings}
          onNotice={onNotice}
          onCanClearChange={onCanClearChange}
          hidden={collapsed}
        />
      </Suspense>
    </section>
  );
}
