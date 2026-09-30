"use client";

import { MapItem } from "./MapItem";
import { NeedCount } from "./NeedCount";
import { NodeCaption } from "./NodeCaption";
import { SignatureRing } from "./SignatureRing";
import { RUN_OUTCOME_LABELS, type RunOutcome, moreNeededLabel } from "./copy";
import { TREASURY_OUTLINE, TREASURY_RADIUS } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, nodeAccessibleName, plateStrokeClass, translate } from "./nodeProps";
import type { NodeTone } from "~~/services/liveMap/motion/frame";

type TreasuryNodeProps = NodeProps & {
  /** The council's rule as words, e.g. "2-of-3". */
  rule: string;
  threshold: number;
  /** Council members who signed the proposal being shown; 0 when none is. */
  signed: number;
  /** The moment the threshold is reached. */
  snap?: boolean;
  /** The ring's colour while an operation plays (`SignatureRing`). */
  ringTone?: NodeTone | null;
  /** Signatures the previewed proposal still needs; the count replaces the caption while it is set. */
  need?: number;
};

const SUBLINE_Y = 28;

const OUTCOME_FILL: Record<RunOutcome, string> = { success: "fill-success-ink", error: "fill-error" };

type TreasurySublineProps = Pick<TreasuryNodeProps, "need" | "ringTone" | "caption" | "preview" | "drawKey">;

/**
 * The line under the rule: the count still needed while a proposal is previewed, how a run ended once
 * the ring has run, and the caption otherwise.
 */
function TreasurySubline({ need, ringTone, caption, preview, drawKey }: TreasurySublineProps) {
  if (need !== undefined) return <NeedCount need={need} y={SUBLINE_Y} />;
  if (ringTone === "success" || ringTone === "error") {
    return (
      <text y={SUBLINE_Y} textAnchor="middle" className={`text-map-caption font-semibold ${OUTCOME_FILL[ringTone]}`}>
        {RUN_OUTCOME_LABELS[ringTone]}
      </text>
    );
  }
  return <NodeCaption y={SUBLINE_Y} caption={caption} preview={preview} drawKey={drawKey} />;
}

/** The governance account: the one large node, its council's rule inside and the approvals around it. */
export function TreasuryNode({ rule, threshold, signed, snap, ringTone, need, ...node }: TreasuryNodeProps) {
  const name = nodeAccessibleName({ ...node, caption: `${rule} ${node.caption}` });
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={need === undefined ? name : `${name}, ${moreNeededLabel(need)}`}
      focus={node.focus}
      activation={node.activation}
      transform={translate(node.position)}
    >
      <circle r={TREASURY_OUTLINE} className={FOCUS_RING_CLASS} strokeWidth={2} />
      <SignatureRing threshold={threshold} signed={signed} snap={snap} tone={ringTone} />
      <circle r={TREASURY_RADIUS} className={plateStrokeClass(node.highlight)} strokeWidth={1.5} />
      <text
        y={-20}
        textAnchor="middle"
        className="fill-base-content/70 text-map-caption font-semibold uppercase tracking-widest"
      >
        {node.label}
      </text>
      <text y={8} textAnchor="middle" className="fill-base-content text-xl font-bold">
        {rule}
      </text>
      <TreasurySubline
        need={need}
        ringTone={ringTone}
        caption={node.caption}
        preview={node.preview}
        drawKey={node.drawKey}
      />
    </MapItem>
  );
}
