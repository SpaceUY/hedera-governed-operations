import { GovernanceGraph } from "./GovernanceGraph";
import { MAP_SNAPSHOT, pendingTransferTo } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXECUTOR_NODE_ID, GOVERNANCE_ACCOUNT_NODE_ID, edgeId, externalNodeId } from "~~/services/governance/graph";
import { MAP_ENTITY_IDS } from "~~/services/governance/graphEntities";

const RECIPIENT = "0.0.7000";
const TRANSFER_EDGE = edgeId(GOVERNANCE_ACCOUNT_NODE_ID, externalNodeId(RECIPIENT));

function renderGraph(props: Partial<Parameters<typeof GovernanceGraph>[0]> = {}) {
  const composed = composeMap({ ...MAP_SNAPSHOT, proposals: [pendingTransferTo(RECIPIENT)] });
  return render(<GovernanceGraph {...composed} council={MAP_SNAPSHOT.council} {...props} />);
}

const nodeElement = (container: HTMLElement, id: string) =>
  [...container.querySelectorAll("[data-node-id]")].find(element => element.getAttribute("data-node-id") === id);

describe("GovernanceGraph", () => {
  it("draws every node as SVG text a test or a screen reader can find", () => {
    renderGraph();
    const map = screen.getByRole("graphics-document", { name: /map of the governed system/i });
    for (const name of ["Treasury", "Proposal registry", "Vault", "Token admin", "Swap adapter", "Swap router"]) {
      expect(within(map).getByText(name).tagName).toBe("text");
    }
    expect(within(map).getByText("0.0.4101")).toBeTruthy();
  });

  it("writes the council's rule on the treasury, apart from the progress around it", () => {
    const { container } = renderGraph({ signed: 1 });
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(container.querySelector("[data-signed]")?.getAttribute("data-signed")).toBe("1");
    expect(container.querySelectorAll("[data-signed] circle")).toHaveLength(2);
  });

  it("keeps the legend on the canvas", () => {
    renderGraph();
    const legend = screen.getByRole("complementary", { name: "Legend" });
    for (const text of ["who may act", "would happen", "where the money is", "account", "contract", "token"]) {
      expect(within(legend).getByText(text)).toBeTruthy();
    }
  });

  it("names nodes and edges by data attributes, never by a DOM id built from a graph id", () => {
    const { container } = renderGraph();
    expect(nodeElement(container, EXECUTOR_NODE_ID)).toBeDefined();
    expect(container.querySelector("[id]")).toBeNull();
    const edge = [...container.querySelectorAll("[data-edge-id]")].find(
      element => element.getAttribute("data-edge-id") === edgeId(MAP_ENTITY_IDS.swapAdapter, MAP_ENTITY_IDS.router),
    );
    expect(edge?.getAttribute("aria-label")).toBe("May act: Swap adapter to Swap router, calls it");
  });

  it("draws a pending proposal's path only while it is being shown", () => {
    const atRest = renderGraph();
    expect(atRest.container.querySelector(`[data-edge-id="${TRANSFER_EDGE}"]`)).toBeNull();
    atRest.unmount();

    const { container } = renderGraph({ phases: { [TRANSFER_EDGE]: "preview" } });
    const preview = container.querySelector(`[data-edge-id="${TRANSFER_EDGE}"] [data-phase]`);
    expect(preview?.getAttribute("data-phase")).toBe("preview");
    expect(preview?.getAttribute("class")).toContain("stroke-map-preview");
  });

  it("is one Tab stop, and the arrow keys walk its nodes and edges", () => {
    const { container } = renderGraph();
    const tabbable = container.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);

    const first = tabbable[0] as SVGGElement;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const second = document.activeElement;
    expect(second).not.toBe(first);
    expect(second?.getAttribute("tabindex")).toBe("0");
    expect(first?.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(second as Element, { key: "End" });
    expect(document.activeElement?.hasAttribute("data-edge-id")).toBe(true);
  });

  it("offers nodes as buttons once something handles them, and reports which one", () => {
    const onActivate = vi.fn();
    renderGraph({ onActivate });
    const vault = screen.getByRole("button", { name: /^Vault,/ });
    fireEvent.click(vault);
    fireEvent.keyDown(vault, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate).toHaveBeenCalledWith({ kind: "node", id: MAP_ENTITY_IDS.vault });
  });

  it("draws a ghost node with no edge to or from it", () => {
    const ghost = {
      id: "ghost",
      label: "Co-signing agent",
      caption: "not a member yet",
      position: { x: 5, y: 5 },
      monogram: "AG",
    };
    const { container } = renderGraph({ ghosts: [ghost] });
    expect(screen.getByText("Co-signing agent")).toBeTruthy();
    expect(screen.getByText("AG")).toBeTruthy();
    const edgeIds = [...container.querySelectorAll("[data-edge-id]")].map(element =>
      element.getAttribute("data-edge-id"),
    );
    expect(edgeIds.some(id => id?.includes("ghost"))).toBe(false);
  });
});
