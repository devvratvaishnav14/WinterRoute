// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setDevSceneOverride, useDevSceneOverride } from "@/lib/weatherScene/devSceneOverride";
import { WeatherSceneLab } from "./WeatherSceneLab";

afterEach(() => {
  cleanup();
  setDevSceneOverride(null);
});

function CurrentOverride() {
  const override = useDevSceneOverride();
  return <span data-testid="current">{override ? `${override.label}-${override.dayPhase}` : "none"}</span>;
}

describe("WeatherSceneLab", () => {
  it("shows the visual-only notice, distinguishing it from anything that could affect trip data", () => {
    render(<WeatherSceneLab />);
    expect(screen.getByText("Visual preview only — does not change trip data.")).toBeTruthy();
  });

  it("sets the override to the clicked preset", async () => {
    const user = userEvent.setup();
    render(
      <>
        <WeatherSceneLab />
        <CurrentOverride />
      </>,
    );

    await user.click(screen.getByText("Heavy Snow"));
    expect(screen.getByTestId("current").textContent).toBe("Heavy Snow-day");
  });

  it("clicking the same preset again clears the override (toggle off)", async () => {
    const user = userEvent.setup();
    render(
      <>
        <WeatherSceneLab />
        <CurrentOverride />
      </>,
    );

    await user.click(screen.getByText("Moderate Rain"));
    await user.click(screen.getByText("Moderate Rain"));
    expect(screen.getByTestId("current").textContent).toBe("none");
  });

  it("can select a genuine dry thunderstorm preset distinct from thunderstorm + rain", async () => {
    const user = userEvent.setup();
    render(
      <>
        <WeatherSceneLab />
        <CurrentOverride />
      </>,
    );

    await user.click(screen.getByText("Thunderstorm"));
    expect(screen.getByTestId("current").textContent).toBe("Thunderstorm-day");
  });

  it("the day/night toggle flips the active preset's dayPhase", async () => {
    const user = userEvent.setup();
    render(
      <>
        <WeatherSceneLab />
        <CurrentOverride />
      </>,
    );

    await user.click(screen.getByText("Clear Day"));
    await user.click(screen.getByText("Day"));
    expect(screen.getByTestId("current").textContent).toBe("Clear Day-night");
  });

  it("'Use real forecast' clears the override entirely", async () => {
    const user = userEvent.setup();
    render(
      <>
        <WeatherSceneLab />
        <CurrentOverride />
      </>,
    );

    await user.click(screen.getByText("Fog"));
    await user.click(screen.getByText("Use real forecast"));
    expect(screen.getByTestId("current").textContent).toBe("none");
  });

  it("offers every preset the stage requires, at minimum", () => {
    render(<WeatherSceneLab />);
    for (const label of [
      "Clear Day",
      "Clear Night",
      "Mainly Clear Day",
      "Partly Cloudy Day",
      "Partly Cloudy Night",
      "Overcast Day",
      "Overcast Night",
      "Fog",
      "Light Drizzle",
      "Light Rain",
      "Moderate Rain",
      "Heavy Rain",
      "Freezing Drizzle",
      "Freezing Rain",
      "Light Snow",
      "Moderate Snow",
      "Heavy Snow",
      "Snow Showers",
      "Thunderstorm",
      "Thunderstorm + Light Rain",
      "Thunderstorm + Heavy Rain",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
