import { GovernanceGraph } from "./GovernanceGraph";
import { MapInspector } from "./MapInspector";
import { inspectorContentOf } from "./inspector";
import { MAP_SNAPSHOT } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { useMapSelection } from "./useMapSelection";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const MAP = composeMap(MAP_SNAPSHOT);

/** The map pane's wiring, without its reads: the graph, the selection and the card. */
function Pane() {
  const { selected, activation, inspectorId, close, paneRef, onKeyDown } = useMapSelection();
  const content =
    selected &&
    inspectorContentOf(selected, {
      graph: MAP.graph,
      ghosts: MAP.ghosts,
      council: MAP_SNAPSHOT.council,
      proposers: MAP_SNAPSHOT.proposers,
      copy: MAP.inspector,
      explorerUrl: "https://hashscan.io/testnet",
    });
  return (
    <div ref={paneRef} onKeyDown={onKeyDown}>
      <GovernanceGraph {...MAP} council={MAP_SNAPSHOT.council} activation={activation} />
      {content && <MapInspector id={inspectorId} content={content} onClose={close} />}
    </div>
  );
}

const inspector = () => screen.queryByRole("region", { name: "Inspector" });

describe("MapInspector in the map pane", () => {
  it("opens with Enter on the focused item, closes with Escape and gives focus back to the item", () => {
    render(<Pane />);
    const vault = screen.getByRole("button", { name: /^Vault,/ });
    vault.focus();
    fireEvent.keyDown(vault, { key: "Enter" });

    const card = inspector();
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByRole("heading", { name: "Vault" })).toBeTruthy();
    expect(within(card as HTMLElement).getByText("Contract · AcmeVault")).toBeTruthy();
    expect(vault.getAttribute("aria-expanded")).toBe("true");
    expect(vault.getAttribute("aria-controls")).toBe(card?.id);

    fireEvent.keyDown(vault, { key: "Escape" });
    expect(inspector()).toBeNull();
    expect(document.activeElement).toBe(vault);
    expect(vault.getAttribute("aria-expanded")).toBe("false");
  });

  it("replaces the card when another item is chosen, and the close button returns focus to that item", () => {
    render(<Pane />);
    fireEvent.click(screen.getByRole("button", { name: /^Vault,/ }));
    const edge = screen.getByRole("button", { name: /^May act: Proposal registry to Vault/ });
    fireEvent.click(edge);

    const card = inspector() as HTMLElement;
    expect(within(card).getByRole("heading", { name: "Proposal registry → Vault" })).toBeTruthy();
    expect(within(card).getByText("Who may act")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Vault,/ }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(within(card).getByRole("button", { name: "Close inspector" }));
    expect(inspector()).toBeNull();
    expect(document.activeElement).toBe(edge);
  });

  it("keeps the ids folded, each linked to its HashScan page", () => {
    render(<Pane />);
    fireEvent.click(screen.getByRole("button", { name: /^Treasury,/ }));
    const card = inspector() as HTMLElement;
    const fold = card.querySelector("details");
    expect(fold?.open).toBe(false);
    expect(within(card).getByText("Ids and links")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "0.0.4000" }).getAttribute("href")).toBe(
      "https://hashscan.io/testnet/account/0.0.4000",
    );
  });
});
