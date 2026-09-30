import { GovernanceMap } from "./GovernanceMap";
import { MAP_SNAPSHOT } from "./mapFixtures";
import { composeMap } from "./mapModel";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REST_FRAME } from "~~/services/liveMap/motion/frame";

const MAP = composeMap(MAP_SNAPSHOT);

describe("GovernanceMap", () => {
  it("draws the composed map", () => {
    render(<GovernanceMap map={MAP} council={MAP_SNAPSHOT.council} frame={REST_FRAME} error={null} />);
    expect(screen.getByRole("graphics-document")).toBeTruthy();
    expect(screen.getByText("Treasury")).toBeTruthy();
  });

  it("says it is reading while the council has not arrived", () => {
    render(<GovernanceMap map={null} council={null} frame={REST_FRAME} error={null} />);
    expect(screen.getByText(/Reading the council/)).toBeTruthy();
    expect(screen.queryByRole("graphics-document")).toBeNull();
  });

  it("says so when the council cannot be read", () => {
    render(<GovernanceMap map={null} council={null} frame={REST_FRAME} error={new Error("Mirror is down")} />);
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read/);
  });
});
