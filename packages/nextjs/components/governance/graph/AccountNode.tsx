"use client";

import { MapItem } from "./MapItem";
import { ACCOUNT_RADIUS, FOCUS_GAP, monogramOf } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, translate } from "./nodeProps";

/** `ghost`: an account the map shows although the ledger connects it to nothing yet. */
export type AccountTone = "account" | "ghost";

/** A council member, a proposer or any other account: a circle, named underneath. */
export function AccountNode({ tone = "account", ...node }: NodeProps & { tone?: AccountTone }) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={`${node.label}, ${node.caption}`}
      focus={node.focus}
      onActivate={node.onActivate}
      transform={translate(node.position)}
    >
      <g className={tone === "ghost" ? "opacity-50" : undefined}>
        <circle r={ACCOUNT_RADIUS + FOCUS_GAP} className={FOCUS_RING_CLASS} strokeWidth={2} />
        <circle
          r={ACCOUNT_RADIUS}
          className={
            tone === "ghost"
              ? "fill-base-100 stroke-base-content/40 [stroke-dasharray:3_3]"
              : "fill-base-100 stroke-base-content/40"
          }
          strokeWidth={1.5}
        />
        <text y={5} textAnchor="middle" className="fill-base-content text-sm font-semibold">
          {monogramOf(node.label)}
        </text>
        <text y={ACCOUNT_RADIUS + 22} textAnchor="middle" className="fill-base-content text-[13px] font-semibold">
          {node.label}
        </text>
        <text y={ACCOUNT_RADIUS + 39} textAnchor="middle" className="fill-base-content/60 text-[11px]">
          {node.caption}
        </text>
      </g>
    </MapItem>
  );
}
