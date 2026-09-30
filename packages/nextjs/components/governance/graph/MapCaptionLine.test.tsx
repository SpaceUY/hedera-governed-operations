import { MapCaptionLine } from "./MapCaptionLine";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("MapCaptionLine", () => {
  it("sets the lead in bold before the sentence", () => {
    render(<MapCaptionLine caption={{ lead: "Drafting.", text: "Pick an operation type." }} />);
    expect(screen.getByText("Drafting.").tagName).toBe("B");
    expect(screen.getByText("Pick an operation type.")).toBeTruthy();
  });
});
