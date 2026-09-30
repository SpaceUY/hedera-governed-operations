"use client";

import { MapItem } from "./MapItem";
import { NodeCaption } from "./NodeCaption";
import { ACCOUNT_RADIUS, FOCUS_GAP, monogramOf } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, nodeAccessibleName, plateStrokeClass, translate } from "./nodeProps";

/** `ghost`: an account the map shows although the ledger connects it to nothing yet. */
export type AccountTone = "account" | "ghost";

/** A council member, a proposer or any other account: a circle, named underneath. */
export function AccountNode({
  tone = "account",
  monogram,
  ...node
}: NodeProps & { tone?: AccountTone; monogram?: string }) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={nodeAccessibleName(node)}
      focus={node.focus}
      activation={node.activation}
      transform={translate(node.position)}
    >
      <g className={tone === "ghost" ? "opacity-50" : undefined}>
        <circle r={ACCOUNT_RADIUS + FOCUS_GAP} className={FOCUS_RING_CLASS} strokeWidth={2} />
        <circle
          r={ACCOUNT_RADIUS}
          className={`${plateStrokeClass(node.highlight)} ${tone === "ghost" ? "[stroke-dasharray:3_3]" : ""}`}
          strokeWidth={1.5}
        />
        <text y={5} textAnchor="middle" className="fill-base-content text-sm font-semibold">
          {monogram ?? monogramOf(node.label)}
        </text>
        <text y={ACCOUNT_RADIUS + 22} textAnchor="middle" className="fill-base-content text-map-label font-semibold">
          {node.label}
        </text>
        <NodeCaption y={ACCOUNT_RADIUS + 39} caption={node.caption} preview={node.preview} drawKey={node.drawKey} />
      </g>
    </MapItem>
  );
}
