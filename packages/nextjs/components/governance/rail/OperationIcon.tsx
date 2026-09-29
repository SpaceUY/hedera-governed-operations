import type { ProposalKind } from "@sh/core/governance/proposalTypes";

/** What a card shows an icon for: a known kind, a registry entry not read, or a body nobody can describe. */
export type OperationIconKind = ProposalKind | "registryCall" | "unrecognized";

/** 16×16 strokes, one per kind: up for an upgrade, both ways for a swap, pause for the token, out for a payment. */
const ICON_PATHS: Record<OperationIconKind, string> = {
  upgrade: "M8 13V3M4 7l4-4 4 4",
  treasurySwap: "M3 5.5h9.5L10 3M13 10.5H3.5L6 13",
  tokenAdmin: "M6 4v8M10 4v8",
  treasuryTransfer: "M3 8h10M9 4l4 4-4 4",
  councilRotation:
    "M5.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M11 4.5a2 2 0 1 1 0 4M12.5 10.8c1.2.4 2 1.4 2 3.2",
  registryCall: "M4 3.5h8v9H4zM6 6.5h4M6 9.5h4",
  unrecognized: "M6 6a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M8 12v.01",
};

const NATIVE_KINDS: readonly OperationIconKind[] = ["treasuryTransfer", "councilRotation"];

/**
 * The kind at a glance: a light stroke on the quiet chip grey, square-cornered for a contract kind and
 * round for a native one; a body nobody can describe in the warning tone.
 */
export const OperationIcon = ({ kind }: { kind: OperationIconKind }) => {
  const tone = kind === "unrecognized" ? "bg-warning/15 text-warning-ink" : "bg-hedera-smoke/15 text-base-content";
  const shape = NATIVE_KINDS.includes(kind) ? "rounded-full" : "rounded-lg";
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center ${shape} ${tone}`} aria-hidden="true">
      <svg
        viewBox="0 0 16 16"
        className="size-4 fill-none stroke-current"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICON_PATHS[kind]} />
      </svg>
    </span>
  );
};
