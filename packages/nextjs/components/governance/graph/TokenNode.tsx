"use client";

import { MapItem } from "./MapItem";
import { FOCUS_GAP, TOKEN_RADIUS, hexagonPoints } from "./geometry";
import { FOCUS_RING_CLASS, type NodeProps, plateStrokeClass, translate } from "./nodeProps";

/** An HTS token: a hexagon with its name inside, so it never reads as an account or a contract. */
export function TokenNode(node: NodeProps) {
  return (
    <MapItem
      item={{ kind: "node", id: node.id }}
      label={`${node.label}, ${node.caption}`}
      focus={node.focus}
      activation={node.activation}
      transform={translate(node.position)}
    >
      <polygon points={hexagonPoints(TOKEN_RADIUS + FOCUS_GAP)} className={FOCUS_RING_CLASS} strokeWidth={2} />
      <polygon points={hexagonPoints(TOKEN_RADIUS)} className={plateStrokeClass(node.highlight)} strokeWidth={1.5} />
      <text y={4} textAnchor="middle" className="fill-base-content text-map-token font-semibold">
        {node.label}
      </text>
      <text y={TOKEN_RADIUS + 18} textAnchor="middle" className="fill-base-content/60 text-map-caption">
        {node.caption}
      </text>
    </MapItem>
  );
}
