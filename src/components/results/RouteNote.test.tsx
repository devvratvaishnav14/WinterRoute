// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WALK_CYCLE_PROVIDER_WARNING } from "@/lib/route/computeRoute";
import { RouteNote } from "./RouteNote";
import { route, segment } from "./fixtures";

afterEach(cleanup);

const walkRoute = route([segment({ mode: "walk" })]);

describe("RouteNote", () => {
  it("renders nothing when there are no provider warnings", () => {
    const { container } = render(<RouteNote route={walkRoute} providerWarnings={[]} />);
    expect(container.textContent).toBe("");
  });

  it("shows the simplified summary, not the raw Google wording, by default", () => {
    render(<RouteNote route={walkRoute} providerWarnings={[WALK_CYCLE_PROVIDER_WARNING]} />);
    expect(screen.getByText(/Walking directions are in beta/)).toBeTruthy();
    expect(screen.queryByText(/might sometimes be missing clear sidewalks/)).toBeNull();
  });

  it("uses the neutral 'Route note' heading, never hazard/warning language", () => {
    render(<RouteNote route={walkRoute} providerWarnings={[WALK_CYCLE_PROVIDER_WARNING]} />);
    expect(screen.getByText(/Route note/)).toBeTruthy();
  });

  it("reveals the full original provider wording behind 'Show details'", async () => {
    const user = userEvent.setup();
    render(<RouteNote route={walkRoute} providerWarnings={[WALK_CYCLE_PROVIDER_WARNING]} />);

    expect(screen.queryByText(/might sometimes be missing clear sidewalks/)).toBeNull();
    await user.click(screen.getByText("Show details"));
    expect(screen.getByText(/might sometimes be missing clear sidewalks/)).toBeTruthy();
  });
});
