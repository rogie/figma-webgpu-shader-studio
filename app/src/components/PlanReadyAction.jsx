export default function PlanReadyAction({
  buildDisabled = false,
  onBuild,
  onDismiss,
}) {
  return (
    <hstack className="chat-context-action">
      <span>Plan is ready to build</span>
      <hstack>
        <fig-button
          type="button"
          variant="primary"
          disabled={buildDisabled ? "" : undefined}
          onClick={onBuild}
        >
          Build plan
        </fig-button>
        <fig-tooltip text="Dismiss plan">
          <fig-button
            type="button"
            variant="ghost"
            icon="true"
            aria-label="Dismiss plan"
            onClick={onDismiss}
          >
            <fig-icon name="close" size="small" />
          </fig-button>
        </fig-tooltip>
      </hstack>
    </hstack>
  );
}
