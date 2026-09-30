// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { route, segment } from "./fixtures";
import { DetailsDrawer } from "./DetailsDrawer";

afterEach(cleanup);

const testRoute = route([segment({ mode: "walk" })]);

describe("DetailsDrawer", () => {
  it("always renders required attribution once expanded, regardless of environment", async () => {
    const user = userEvent.setup();
    render(
      <DetailsDrawer
        route={testRoute}
        providerWarnings={[]}
        routeState={null}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={null}
        durationState={null}
        timingState={null}
      />,
    );

    await user.click(screen.getByText("How WinterRoute calculated this"));
    expect(screen.getByText(/Open-Meteo/)).toBeTruthy();
    expect(screen.getByText(/DriveBC/)).toBeTruthy();
  });

  it("never shows the Weather Scene Lab (or any other dev-only diagnostics) outside development — this test process runs with NODE_ENV !== \"development\"", async () => {
    const user = userEvent.setup();
    render(
      <DetailsDrawer
        route={testRoute}
        providerWarnings={[]}
        routeState={null}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={null}
        durationState={null}
        timingState={null}
      />,
    );

    await user.click(screen.getByText("How WinterRoute calculated this"));
    expect(screen.queryByText("Weather Scene Lab")).toBeNull();
    expect(screen.queryByText("Visual preview only — does not change trip data.")).toBeNull();
    expect(screen.queryByText("Development-only diagnostics")).toBeNull();
  });

  it("never shows the raw route-note diagnostics outside development, even when provider warnings exist", async () => {
    const user = userEvent.setup();
    render(
      <DetailsDrawer
        route={testRoute}
        providerWarnings={["This app is not liable for..."]}
        routeState={null}
        weatherState={null}
        trafficState={null}
        transitState={null}
        riskState={null}
        durationState={null}
        timingState={null}
      />,
    );

    await user.click(screen.getByText("How WinterRoute calculated this"));
    expect(screen.queryByText(/Route note/)).toBeNull();
  });
});
