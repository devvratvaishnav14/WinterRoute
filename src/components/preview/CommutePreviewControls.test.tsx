// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommutePreviewControls } from "./CommutePreviewControls";

afterEach(cleanup);

const noop = () => {};

describe("CommutePreviewControls — readability over the (uncarded) weather scene", () => {
  it("gives 'Preview my commute' a real background fill, not just a bare border", () => {
    render(<CommutePreviewControls status="idle" announcement="" canPlay onStart={noop} onPause={noop} onResume={noop} onStop={noop} onReplay={noop} />);
    const button = screen.getByRole("button", { name: /Preview my commute/ });
    expect(button.className).toMatch(/bg-white\/\[/);
  });

  it("gives 'Preview my commute' a more noticeable, inviting treatment than the plain Pause/Stop buttons (a soft persistent glow, a hover-only lift disabled under reduced motion)", () => {
    render(<CommutePreviewControls status="idle" announcement="" canPlay onStart={noop} onPause={noop} onResume={noop} onStop={noop} onReplay={noop} />);
    const button = screen.getByRole("button", { name: /Preview my commute/ });
    expect(button.className).toMatch(/shadow-\[/);
    expect(button.className).toMatch(/hover:-translate-y/);
    expect(button.className).toMatch(/motion-reduce:hover:translate-y-0/);
  });

  it("still calls onStart when clicked — the visual refresh didn't break the click handler", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<CommutePreviewControls status="idle" announcement="" canPlay onStart={onStart} onPause={noop} onResume={noop} onStop={noop} onReplay={noop} />);
    await user.click(screen.getByRole("button", { name: /Preview my commute/ }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("Replay gets the same inviting treatment as the initial Preview button, and still calls onReplay when clicked", async () => {
    const user = userEvent.setup();
    const onReplay = vi.fn();
    render(<CommutePreviewControls status="complete" announcement="" canPlay onStart={noop} onPause={noop} onResume={noop} onStop={noop} onReplay={onReplay} />);
    const button = screen.getByRole("button", { name: /Replay/ });
    expect(button.className).toMatch(/shadow-\[/);
    await user.click(button);
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it("gives the plain Pause/Stop buttons a background fill too, not just a border", () => {
    render(<CommutePreviewControls status="playing" announcement="" canPlay onStart={noop} onPause={noop} onResume={noop} onStop={noop} onReplay={noop} />);
    expect(screen.getByRole("button", { name: "Pause" }).className).toMatch(/bg-white\/\[/);
    expect(screen.getByRole("button", { name: "Stop" }).className).toMatch(/bg-white\/\[/);
  });

  it("renders nothing when the route can't be previewed", () => {
    const { container } = render(<CommutePreviewControls status="idle" announcement="" canPlay={false} onStart={noop} onPause={noop} onResume={noop} onStop={noop} onReplay={noop} />);
    expect(container.textContent).toBe("");
  });
});
