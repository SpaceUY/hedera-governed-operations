"use client";

import { MapItem } from "./MapItem";
import { NeedCount } from "./NeedCount";
import { NodeCaption } from "./NodeCaption";
import { SignatureRing } from "./SignatureRing";
import { moreNeededLabel, treasurySubline } from "./copy";
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
      {need !== undefined ? (
        <NeedCount need={need} y={28} />
      ) : ringTone === "success" || ringTone === "error" ? (
        <text
          y={28}
          textAnchor="middle"
          className={`text-map-caption font-semibold ${ringTone === "success" ? "fill-success-ink" : "fill-error"}`}
        >
          {treasurySubline(node.caption, ringTone)}
        </text>
      ) : (
        <NodeCaption y={28} caption={node.caption} preview={node.preview} drawKey={node.drawKey} />
      )}
    </MapItem>
  );
}
