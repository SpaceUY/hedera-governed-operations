"use client";

import { MapItem } from "./MapItem";
import { SignatureRing } from "./SignatureRing";
import { TREASURY_OUTLINE, TREASURY_RADIUS } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, plateStrokeClass, translate } from "./nodeProps";

type TreasuryNodeProps = NodeProps & {
  /** The council's rule as words, e.g. "2-of-3". */
  rule: string;
  threshold: number;
  /** Council members who signed the proposal being shown; 0 when none is. */
  signed: number;
  /** The moment the threshold is reached. */
  snap?: boolean;
};

/** The governance account: the one large node, its council's rule inside and the approvals around it. */
export function TreasuryNode({ rule, threshold, signed, snap, ...node }: TreasuryNodeProps) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={`${node.label}, ${rule} ${node.caption}`}
      focus={node.focus}
      onActivate={node.onActivate}
      transform={translate(node.position)}
    >
      <circle r={TREASURY_OUTLINE} className={FOCUS_RING_CLASS} strokeWidth={2} />
      <SignatureRing threshold={threshold} signed={signed} snap={snap} />
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
      <text y={28} textAnchor="middle" className="fill-base-content/60 text-map-caption">
        {node.caption}
      </text>
    </MapItem>
  );
}
