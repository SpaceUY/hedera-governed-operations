"use client";

import { MapItem } from "./MapItem";
import { CONTRACT_SIZE, FOCUS_GAP } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, plateStrokeClass, translate } from "./nodeProps";

/** `external`: a contract outside the governed system, which it calls but does not control. */
export type ContractTone = "contract" | "external";

const { width, height } = CONTRACT_SIZE;

/** A contract: a rounded rectangle with its name inside. */
export function ContractNode({ tone = "contract", ...node }: NodeProps & { tone?: ContractTone }) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={`${node.label}, ${node.caption}`}
      focus={node.focus}
      activation={node.activation}
      transform={translate(node.position)}
    >
      <rect
        x={-width / 2 - FOCUS_GAP}
        y={-height / 2 - FOCUS_GAP}
        width={width + FOCUS_GAP * 2}
        height={height + FOCUS_GAP * 2}
        rx={18}
        className={FOCUS_RING_CLASS}
        strokeWidth={2}
      />
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={14}
        className={`${plateStrokeClass(node.highlight)} ${tone === "external" ? "[stroke-dasharray:4_4]" : ""}`}
        strokeWidth={1.5}
      />
      <text y={-4} textAnchor="middle" className="fill-base-content text-map-label font-semibold">
        {node.label}
      </text>
      <text y={15} textAnchor="middle" className="fill-base-content/60 text-map-caption">
        {node.caption}
      </text>
    </MapItem>
  );
}
