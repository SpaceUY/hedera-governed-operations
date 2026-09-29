import { GovernanceGraph } from "./GovernanceGraph";
import { MAP_SNAPSHOT, pendingTransferTo } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EXECUTOR_NODE_ID, GOVERNANCE_ACCOUNT_NODE_ID, edgeId, externalNodeId } from "~~/services/liveMap/model/graph";
import { MAP_ENTITY_IDS } from "~~/services/liveMap/model/graphEntities";
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
    const { container } = renderGraph({ frame: { ...REST_FRAME, ring: { signed: 1, snap: false, tone: null } } });
    expect(screen.getByText("2-of-3")).toBeTruthy();
    expect(container.querySelector("[data-signed]")?.getAttribute("data-signed")).toBe("1");
    expect(container.querySelectorAll('[data-signed] [data-filled="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-signed] [data-filled="false"]')).toHaveLength(1);
  });

  it("fills the ring in the primary colour at rest and in the operation's colour while one plays", () => {
    const filledClass = (tone: "progress" | "success" | "error" | null) => {
      const { container, unmount } = renderGraph({ frame: { ...REST_FRAME, ring: { signed: 1, snap: false, tone } } });
      const segment = container.querySelector('[data-signed] [data-filled="true"]')?.getAttribute("class");
      unmount();
      return segment;
    };
    expect(filledClass(null)).toContain("stroke-primary");
    expect(filledClass("progress")).toContain("stroke-warning");
    expect(filledClass("success")).toContain("stroke-success");
    expect(filledClass("error")).toContain("stroke-error");
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
    renderGraph({ activation: { onActivate, selected: null } });
    const vault = screen.getByRole("button", { name: /^Vault,/ });
    fireEvent.click(vault);
    fireEvent.keyDown(vault, { key: "Enter" });
    fireEvent.keyDown(vault, { key: " " });
    expect(onActivate).toHaveBeenCalledTimes(3);
    expect(onActivate).toHaveBeenCalledWith({ kind: "node", id: MAP_ENTITY_IDS.vault });
    expect(vault.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a pointer over every node and line a click opens, and none over an inert map", () => {
    const { container, unmount } = renderGraph({ activation: { onActivate: vi.fn(), selected: null } });
    const items = [...container.querySelectorAll("[data-node-id], [data-edge-id]")];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.getAttribute("class")).toContain("cursor-pointer");
    unmount();

    const inert = renderGraph().container;
    for (const item of inert.querySelectorAll("[data-node-id], [data-edge-id]")) {
      expect(item.getAttribute("class")).not.toContain("cursor-pointer");
    }
  });

  it("marks the selected item as expanded and points it at the inspector, which also draws its highlight", () => {
    const vaultEdge = edgeId(EXECUTOR_NODE_ID, MAP_ENTITY_IDS.vault);
    const { container } = renderGraph({
      activation: { onActivate: vi.fn(), selected: { kind: "edge", id: vaultEdge }, controls: "inspector" },
    });
    const edge = [...container.querySelectorAll("[data-edge-id]")].find(
      element => element.getAttribute("data-edge-id") === vaultEdge,
    );
    expect(edge?.getAttribute("aria-expanded")).toBe("true");
    expect(edge?.getAttribute("aria-controls")).toBe("inspector");
    expect(edge?.querySelector("path:nth-child(2)")?.getAttribute("class")).toContain(
      "group-aria-expanded:opacity-100",
    );
    const vault = nodeElement(container, MAP_ENTITY_IDS.vault);
    expect(vault?.getAttribute("aria-expanded")).toBe("false");
    expect(vault?.hasAttribute("aria-controls")).toBe(false);
    expect(vault?.querySelectorAll("rect")[1]?.getAttribute("class")).toContain("group-aria-expanded:stroke-primary");
  });

  it("is inert without a host: items are graphics symbols, never buttons that do nothing", () => {
    const { container } = renderGraph();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(nodeElement(container, MAP_ENTITY_IDS.vault)?.hasAttribute("aria-expanded")).toBe(false);
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
    expect(comets[0].getAttribute("class")).toContain("motion-reduce:hidden");
    // A faint tail behind the head, both moved by the same clock.
    const parts = [...comets[0].querySelectorAll<SVGPathElement>("[data-comet-part]")];
    expect(parts.map(part => part.getAttribute("data-comet-part"))).toEqual(["tail", "head"]);
    for (const part of parts) expect(part.style.animationDuration).toBe("1100ms");
    expect(parts[0].getAttribute("class")).toContain("animate-map-comet-tail");
    expect(parts[1].getAttribute("class")).toContain("animate-map-comet");
  });

  it("brings a comet back with head and tail on one set of offsets", () => {
    const { container } = renderGraph({
      frame: { ...REST_FRAME, comets: [{ edgeId: TRANSFER_EDGE, ms: 700, delayMs: 300, direction: "back" }] },
    });
    for (const part of container.querySelectorAll<SVGPathElement>("[data-comet-part]")) {
      expect(part.getAttribute("class")).toContain("animate-map-comet-back");
      expect(part.style.animationDelay).toBe("300ms");
    }
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
    const { container } = renderGraph({ frame: { ...REST_FRAME, ring: { signed: 2, snap: true, tone: "success" } } });
    expect(container.querySelector("[data-signed]")?.getAttribute("class")).toContain("animate-map-ring-snap");
  });

  it("holds every node still at rest: nothing on the map loops", () => {
    const { container } = renderGraph();
    for (const element of container.querySelectorAll("svg [class]")) {
      expect(element.getAttribute("class")).not.toMatch(/animate-/);
    }
  });

  it("thickens an edge under the pointer or focus through the stylesheet, and writes nothing over the map", () => {
    const { container } = renderGraph();
    const edge = container.querySelector("[data-edge-id]");
    expect(edge?.querySelector("[data-phase]")?.getAttribute("class")).toContain("map-edge-line");
    expect(container.querySelector("[data-edge-id] text")).toBeNull();
  });

  it("names the regions a layout gives it, and draws a still glow behind the treasury as decoration", () => {
    const regions = [
      { label: "Council", position: { x: 20, y: 300 }, orientation: "vertical" as const },
      { label: "Contracts", position: { x: 700, y: 20 }, orientation: "horizontal" as const },
    ];
    const { container } = renderGraph({ regions });
    expect(screen.getByText("Council").getAttribute("transform")).toBe("rotate(-90 20 300)");
    expect(screen.getByText("Contracts").getAttribute("transform")).toBeNull();
    const glow = container.querySelector<SVGGElement>("svg > g[aria-hidden]");
    expect(glow?.getAttribute("class")).toBe("pointer-events-none");
    expect(glow?.querySelector("circle")?.getAttribute("class")).toBe("fill-primary/2 dark:fill-primary/4");
  });
});
