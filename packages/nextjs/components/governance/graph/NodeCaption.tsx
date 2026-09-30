type NodeCaptionProps = { y: number; caption: string; preview?: string; drawKey?: string | null };

/**
 * The line under a node's name. While a preview names the node, the caption fades out and the
 * preview's words fade in over it in the preview's violet ink; both are real text.
 */
export function NodeCaption({ y, caption, preview, drawKey }: NodeCaptionProps) {
  return (
    <>
      <text
        y={y}
        textAnchor="middle"
        className={`map-crossfade fill-base-content/60 text-map-caption ${preview ? "opacity-0" : "opacity-100"}`}
      >
        {caption}
      </text>
      {preview && (
        <text
          key={drawKey ?? preview}
          y={y}
          textAnchor="middle"
          data-preview-label
          className="fill-map-preview-ink text-map-caption font-semibold motion-safe:animate-map-fade-in"
        >
          {preview}
        </text>
      )}
    </>
  );
}
