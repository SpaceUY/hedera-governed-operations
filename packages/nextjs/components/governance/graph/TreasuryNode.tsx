"use client";

import { MapItem } from "./MapItem";
import { SignatureRing } from "./SignatureRing";
import { TREASURY_OUTLINE, TREASURY_RADIUS } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, translate } from "./nodeProps";

type TreasuryNodeProps = NodeProps & {
  /** The council's rule as words, e.g. "2-of-3". */
  rule: string;
  threshold: number;
  /** Council members who signed the proposal being shown; 0 when none is. */
  signed: number;
};

/** The governance account: the one large node, its council's rule inside and the approvals around it. */
export function TreasuryNode({ rule, threshold, signed, ...node }: TreasuryNodeProps) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={`${node.label}, ${rule} ${node.caption}`}
      focus={node.focus}
      onActivate={node.onActivate}
      transform={translate(node.position)}
    >
      <circle r={TREASURY_OUTLINE} className={FOCUS_RING_CLASS} strokeWidth={2} />
      <SignatureRing threshold={threshold} signed={signed} />
      <circle r={TREASURY_RADIUS} className="fill-base-100 stroke-base-content/40" strokeWidth={1.5} />
      <text
        y={-20}
        textAnchor="middle"
        className="fill-base-content/70 text-[11px] font-semibold uppercase tracking-widest"
      >
        {node.label}
      </text>
      <text y={8} textAnchor="middle" className="fill-base-content text-xl font-bold">
        {rule}
      </text>
      <text y={28} textAnchor="middle" className="fill-base-content/60 text-[11px]">
        {node.caption}
      </text>
    </MapItem>
  );
}
