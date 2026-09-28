import { GovernanceGraph } from "./GovernanceGraph";
import { MAP_SNAPSHOT, pendingTransferTo } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXECUTOR_NODE_ID, GOVERNANCE_ACCOUNT_NODE_ID, edgeId, externalNodeId } from "~~/services/governance/graph";
import { MAP_ENTITY_IDS } from "~~/services/governance/graphEntities";
import { REST_FRAME } from "~~/services/liveMap/motion/frame";

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
    const { container } = renderGraph({ frame: { ...REST_FRAME, ring: { signed: 1, snap: false } } });
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(container.querySelector("[data-signed]")?.getAttribute("data-signed")).toBe("1");
    expect(container.querySelectorAll('[data-signed] [data-filled="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-signed] [data-filled="false"]')).toHaveLength(1);
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

    const { container } = renderGraph({ frame: { ...REST_FRAME, phases: { [TRANSFER_EDGE]: "preview" } } });
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
    const ghost = { id: "ghost", label: "Co-signing agent", caption: "not a member yet", position: { x: 5, y: 5 } };
    const { container } = renderGraph({ ghosts: [ghost] });
    expect(screen.getByText("Co-signing agent")).toBeTruthy();
    const edgeIds = [...container.querySelectorAll("[data-edge-id]")].map(element =>
      element.getAttribute("data-edge-id"),
    );
    expect(edgeIds.some(id => id?.includes("ghost"))).toBe(false);
  });

  it("sends a comet along an edge the frame names, and none along an edge the map does not have", () => {
    const { container } = renderGraph({
      frame: {
        ...REST_FRAME,
        phases: { [TRANSFER_EDGE]: "progress" },
        comets: [
          { edgeId: TRANSFER_EDGE, ms: 1100, delayMs: 0, direction: "forward" },
          { edgeId: "nowhere->nothing", ms: 1100, delayMs: 0, direction: "forward" },
        ],
      },
    });
    const comets = container.querySelectorAll("[data-comet]");
    expect(comets).toHaveLength(1);
    expect((comets[0] as SVGPathElement).style.animationDuration).toBe("1100ms");
    expect(comets[0].getAttribute("class")).toContain("motion-reduce:hidden");
  });

  it("keeps an intent edge drawn while the frame relaxes it to rest", () => {
    const { container } = renderGraph({ frame: { ...REST_FRAME, phases: { [TRANSFER_EDGE]: "rest" } } });
    expect(container.querySelector(`[data-edge-id="${TRANSFER_EDGE}"] [data-phase]`)?.getAttribute("data-phase")).toBe(
      "rest",
    );
  });

  it("flashes the node an operation reaches and shakes the one it failed at", () => {
    const { container } = renderGraph({
      frame: { ...REST_FRAME, highlights: { [MAP_ENTITY_IDS.vault]: "success" }, shaking: [EXECUTOR_NODE_ID] },
    });
    const vaultPlate = nodeElement(container, MAP_ENTITY_IDS.vault)?.querySelectorAll("rect")[1];
    expect(vaultPlate?.getAttribute("class")).toContain("stroke-success");
    expect(nodeElement(container, EXECUTOR_NODE_ID)?.parentElement?.getAttribute("class")).toContain(
      "animate-map-shake",
    );
  });

  it("snaps the ring when the threshold is reached", () => {
    const { container } = renderGraph({ frame: { ...REST_FRAME, ring: { signed: 2, snap: true } } });
    expect(container.querySelector("[data-signed]")?.getAttribute("class")).toContain("animate-map-ring-snap");
  });

  it("lets every node drift on a loop of its own, which reduced motion stops", () => {
    const { container } = renderGraph();
    const drifts = [EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault].map(
      id => nodeElement(container, id)?.parentElement?.parentElement,
    );
    for (const drift of drifts) expect(drift?.getAttribute("class")).toBe("motion-safe:animate-map-drift");
    const [executor, vault] = drifts.map(drift => drift?.style.animationDuration);
    expect(executor).not.toBe(vault);
  });

  it("thickens an edge under the pointer or focus through the stylesheet, and fades its caption in", () => {
    const { container } = renderGraph();
    const edge = container.querySelector("[data-edge-id]");
    expect(edge?.querySelector("[data-phase]")?.getAttribute("class")).toContain("map-edge-line");
    expect(edge?.querySelector("text")?.getAttribute("class")).toContain("group-hover:opacity-100");
  });

  it("names the regions a layout gives it, and draws the glow behind the treasury as decoration", () => {
    const regions = [
      { label: "Council", position: { x: 20, y: 300 }, orientation: "vertical" as const },
      { label: "Contracts", position: { x: 700, y: 20 }, orientation: "horizontal" as const },
    ];
    const { container } = renderGraph({ regions });
    expect(screen.getByText("Council").getAttribute("transform")).toBe("rotate(-90 20 300)");
    expect(screen.getByText("Contracts").getAttribute("transform")).toBeNull();
    expect(container.querySelector(".motion-safe\\:animate-map-glow")?.getAttribute("aria-hidden")).toBe("true");
  });
});
