// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RiskSummary } from "./RiskSummary";
import { riskState } from "./fixtures";

afterEach(cleanup);

describe("RiskSummary", () => {
  it("shows Unavailable, never a fake index, when risk data is insufficient", () => {
    render(<RiskSummary state={riskState({ predictionStatus: "insufficient-data" })} />);

    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.queryByText("/ 100")).toBeNull();
  });

  it("uses the Commute Disruption label, not the ambiguous Commute Risk", () => {
    render(<RiskSummary state={riskState({ predictionStatus: "available", overallIndex: 62, label: "High" })} />);

    expect(screen.getByText("Commute disruption")).toBeTruthy();
    expect(screen.queryByText("Commute risk")).toBeNull();
  });

  it("shows the qualitative label as primary and the index as a secondary, clearly-labeled line", () => {
    render(<RiskSummary state={riskState({ predictionStatus: "available", overallIndex: 62, label: "High" })} />);

    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText((_, node) => node?.textContent === "WinterRoute index: 62 / 100")).toBeTruthy();
    expect(screen.getByText(/Experimental disruption index/)).toBeTruthy();
  });

  it("never phrases the index as a percentage or probability, even at 0", () => {
    render(<RiskSummary state={riskState({ predictionStatus: "available", overallIndex: 0, label: "Low" })} />);

    expect(screen.getByText((_, node) => node?.textContent === "WinterRoute index: 0 / 100")).toBeTruthy();
    expect(screen.queryByText(/0%/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/chance/i)).toBeNull();
    expect(screen.queryByText(/probability/i)).toBeNull();
  });

  it("surfaces a limited-data notice without hiding the index", () => {
    render(<RiskSummary state={riskState({ predictionStatus: "limited-data", overallIndex: 30, label: "Moderate" })} />);

    expect(screen.getByText((_, node) => node?.textContent === "WinterRoute index: 30 / 100")).toBeTruthy();
    expect(screen.getByText("Limited data")).toBeTruthy();
  });

  it("renders nothing before the risk model has resolved", () => {
    const { container } = render(<RiskSummary state={null} />);
    expect(container.textContent).toBe("");
  });
});
