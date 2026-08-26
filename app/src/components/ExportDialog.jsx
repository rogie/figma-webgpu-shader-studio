import {
  IMAGE_FORMAT_OPTIONS,
  VIDEO_ASPECT_OPTIONS,
  VIDEO_FORMAT_OPTIONS,
  imageExportHasQuality,
} from "../runtime/exportVideo.js";

const FRAME_RATE_OPTIONS = [
  { value: "24", label: "24 fps" },
  { value: "30", label: "30 fps" },
  { value: "60", label: "60 fps" },
];

const BITRATE_OPTIONS = [
  { value: "4", label: "4 Mbps" },
  { value: "8", label: "8 Mbps" },
  { value: "16", label: "16 Mbps" },
  { value: "32", label: "32 Mbps" },
];

export default function ExportDialog({
  dialogRef,
  tabsRef,
  tab,
  settings,
  resolutionOptions,
  opaqueContent,
  imageFormatRef,
  imageResolutionRef,
  imageAspectRef,
  videoFormatRef,
  videoResolutionRef,
  videoAspectRef,
  videoFrameRateRef,
  videoBitrateRef,
  embedFormatRef,
  embedCode,
  embedLinkAvailable,
  iframeEmbedAvailable,
  iframeEmbedUnavailableMessage,
  onClose,
  onExportImage,
  onExportVideo,
  onDownloadEmbed,
  onCopyEmbed,
  onCopyEmbedLink,
  onDurationInput,
  onImageQualityInput,
}) {
  const showAspect = settings.resolution !== "current";
  const showImageQuality = imageExportHasQuality(settings.imageFormat);
  const iframeEmbedSelected = settings.embedFormat === "iframe";
  const embedActionsDisabled =
    iframeEmbedSelected && !iframeEmbedAvailable;

  return (
    <dialog
      is="fig-dialog"
      ref={dialogRef}
      class="export-dialog"
      aria-label="Export"
      modal=""
      closedby="closerequest"
      position="center center"
      autoresize=""
      onClose={onClose}
      onCancel={onClose}
    >
      <fig-header dialog-header="">
        <fig-tabs ref={tabsRef} name="export-kind" value={tab}>
          <fig-tab value="image" content="#export-tab-image">
            Image
          </fig-tab>
          <fig-tab value="video" content="#export-tab-video">
            Video
          </fig-tab>
          <fig-tab value="embed" content="#export-tab-embed">
            Embed
          </fig-tab>
        </fig-tabs>
        <fig-tooltip text="Close">
          <fig-button
            variant="ghost"
            icon=""
            close-dialog=""
            aria-label="Close dialog"
          >
            <fig-icon name="close" />
          </fig-button>
        </fig-tooltip>
      </fig-header>
      <fig-content>
        <fig-tab-content id="export-tab-image">
          <fig-field direction="horizontal" columns="thirds">
            <label>Format</label>
            <fig-select
              ref={imageFormatRef}
              value={settings.imageFormat}
              position="bottom right"
              full=""
              options={JSON.stringify(IMAGE_FORMAT_OPTIONS)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          {showImageQuality && (
            <fig-field direction="horizontal" columns="thirds">
              <label>Quality</label>
              <fig-slider
                value={settings.imageQuality}
                min="1"
                max="100"
                step="1"
                units="%"
                full=""
                onInput={onImageQualityInput}
                dangerouslySetInnerHTML={opaqueContent}
              />
            </fig-field>
          )}
          <fig-field direction="horizontal" columns="thirds">
            <label>Resolution</label>
            <fig-select
              ref={imageResolutionRef}
              value={settings.resolution}
              position="bottom right"
              full=""
              options={JSON.stringify(resolutionOptions)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          {showAspect && (
            <fig-field direction="horizontal" columns="thirds">
              <label>Aspect</label>
              <fig-select
                ref={imageAspectRef}
                value={settings.aspect}
                position="bottom right"
                full=""
                options={JSON.stringify(VIDEO_ASPECT_OPTIONS)}
                dangerouslySetInnerHTML={opaqueContent}
              />
            </fig-field>
          )}
        </fig-tab-content>
        <fig-tab-content id="export-tab-video">
          <fig-field direction="horizontal" columns="thirds">
            <label>Format</label>
            <fig-select
              ref={videoFormatRef}
              value={settings.format}
              position="bottom right"
              full=""
              options={JSON.stringify(VIDEO_FORMAT_OPTIONS)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Resolution</label>
            <fig-select
              ref={videoResolutionRef}
              value={settings.resolution}
              position="bottom right"
              full=""
              options={JSON.stringify(resolutionOptions)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          {showAspect && (
            <fig-field direction="horizontal" columns="thirds">
              <label>Aspect</label>
              <fig-select
                ref={videoAspectRef}
                value={settings.aspect}
                position="bottom right"
                full=""
                options={JSON.stringify(VIDEO_ASPECT_OPTIONS)}
                dangerouslySetInnerHTML={opaqueContent}
              />
            </fig-field>
          )}
          <fig-field direction="horizontal" columns="thirds">
            <label>Duration</label>
            <fig-slider
              value={settings.duration}
              min="1"
              max="30"
              step="1"
              units="s"
              full=""
              onInput={onDurationInput}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Frame rate</label>
            <fig-select
              ref={videoFrameRateRef}
              value={settings.frameRate}
              position="bottom right"
              full=""
              options={JSON.stringify(FRAME_RATE_OPTIONS)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
          <fig-field direction="horizontal" columns="thirds">
            <label>Bitrate</label>
            <fig-select
              ref={videoBitrateRef}
              value={settings.bitrate}
              position="bottom right"
              full=""
              options={JSON.stringify(BITRATE_OPTIONS)}
              dangerouslySetInnerHTML={opaqueContent}
            />
          </fig-field>
        </fig-tab-content>
        <fig-tab-content id="export-tab-embed">
          <fig-field direction="horizontal" columns="thirds">
            <label>Format</label>
            <fig-segmented-control
              ref={embedFormatRef}
              value={settings.embedFormat}
              full=""
              sizing="equal"
              aria-label="Embed format"
            >
              <fig-segment
                value="code"
                selected={settings.embedFormat === "code"}
              >
                HTML
              </fig-segment>
              <fig-segment
                value="iframe"
                selected={settings.embedFormat === "iframe"}
              >
                iFrame
              </fig-segment>
            </fig-segmented-control>
          </fig-field>
          <fig-field>
            <textarea
              id="shader-embed-code"
              className="embed-code"
              value={embedCode}
              readOnly
              rows="5"
              spellCheck="false"
              onFocus={(event) => event.currentTarget.select()}
            />
          </fig-field>
          {iframeEmbedSelected ? (
            <fig-field>
              {!iframeEmbedAvailable ? (
                <p>{iframeEmbedUnavailableMessage}</p>
              ) : null}
              <p>
                Private embeds render only for viewers whose Shader Studio
                session can access the item. Viewers should authenticate in a
                top-level tab first; browsers that partition third-party
                storage or block Access cookies may still block the embed.
              </p>
            </fig-field>
          ) : null}
        </fig-tab-content>
      </fig-content>
      <fig-footer>
        {tab === "embed" ? (
          <>
            <fig-button
              type="button"
              variant="link"
              disabled={!embedLinkAvailable ? "" : undefined}
              onClick={onCopyEmbedLink}
            >
              Copy link
            </fig-button>
            <fig-button
              type="button"
              variant="secondary"
              disabled={embedActionsDisabled ? "" : undefined}
              onClick={onDownloadEmbed}
            >
              Download
            </fig-button>
            <fig-button
              type="button"
              variant="primary"
              disabled={embedActionsDisabled ? "" : undefined}
              onClick={onCopyEmbed}
            >
              Copy
            </fig-button>
          </>
        ) : (
          <fig-button
            type="button"
            variant="primary"
            onClick={tab === "video" ? onExportVideo : onExportImage}
          >
            Export
          </fig-button>
        )}
      </fig-footer>
    </dialog>
  );
}