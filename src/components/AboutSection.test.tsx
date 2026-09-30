// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AboutSection } from "./AboutSection";

afterEach(cleanup);

describe("AboutSection", () => {
  it("renders the 'About this project' heading", () => {
    render(<AboutSection />);
    expect(screen.getByText("About this project")).toBeTruthy();
  });

  it("renders the exact project description", () => {
    render(<AboutSection />);
    expect(
      screen.getByText(
        "WinterRoute helps people understand how weather, traffic, transit, and route conditions may affect a trip before they leave. It is designed to give a clearer picture of what to expect along a chosen route, including possible delays, conditions along the way, and a quick preview of the commute.",
      ),
    ).toBeTruthy();
  });

  it("renders the creator name", () => {
    render(<AboutSection />);
    expect(screen.getByText("Devvrat Vaishnav")).toBeTruthy();
  });

  it("renders the study line", () => {
    render(<AboutSection />);
    expect(screen.getByText("BSc in Data Science")).toBeTruthy();
  });

  it("makes the name visually more prominent than the study line", () => {
    render(<AboutSection />);
    const name = screen.getByText("Devvrat Vaishnav");
    const study = screen.getByText("BSc in Data Science");
    expect(name.className).toContain("font-medium");
    expect(name.className).not.toBe(study.className);
  });

  it("never adds a profile photo, social buttons, or contact links — stays a minimal text-only credit", () => {
    const { container } = render(<AboutSection />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("a").length).toBe(0);
  });
});
