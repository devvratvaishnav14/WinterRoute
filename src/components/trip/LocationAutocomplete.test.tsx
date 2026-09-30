// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResolvedLocation } from "@/lib/route/types";
import * as placesClient from "@/lib/client/placesClient";
import { LocationAutocomplete } from "./LocationAutocomplete";

const SFU: ResolvedLocation = {
  label: "Simon Fraser University",
  latitude: 49.279,
  longitude: -122.92,
  provider: "google-places",
  providerPlaceId: "place-sfu",
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("LocationAutocomplete", () => {
  it("invalidates a resolved selection the moment its text is edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <LocationAutocomplete
        id="origin"
        label="Starting point"
        placeholder="e.g. SFU"
        markerVariant="origin"
        value={SFU}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Starting point" }) as HTMLInputElement;
    expect(input.value).toBe("Simon Fraser University");

    await user.type(input, " x");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("resolves a selected suggestion and calls onChange with a ResolvedLocation", async () => {
    vi.spyOn(placesClient, "fetchAutocompleteSuggestions").mockResolvedValue([
      { placeId: "place-sfu", mainText: "SFU", secondaryText: "Burnaby, BC" },
    ]);
    vi.spyOn(placesClient, "resolvePlace").mockResolvedValue({
      location: SFU,
      municipality: "Burnaby",
      inServiceArea: true,
    });

    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <LocationAutocomplete
        id="origin"
        label="Starting point"
        placeholder="e.g. SFU"
        markerVariant="origin"
        value={null}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Starting point" });
    await user.type(input, "SFU");

    const option = await screen.findByText("SFU", {}, { timeout: 2000 });
    await user.click(option);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(SFU));
  });

  it("shows the service-area message and does not resolve a place outside it", async () => {
    vi.spyOn(placesClient, "fetchAutocompleteSuggestions").mockResolvedValue([
      { placeId: "place-richmond", mainText: "Richmond Centre", secondaryText: "Richmond, BC" },
    ]);
    vi.spyOn(placesClient, "resolvePlace").mockResolvedValue({
      location: { label: "Richmond Centre", latitude: 49.16, longitude: -123.13 },
      municipality: "Richmond",
      inServiceArea: false,
    });

    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <LocationAutocomplete
        id="destination"
        label="Destination"
        placeholder="e.g. Metrotown"
        markerVariant="destination"
        value={null}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("combobox", { name: "Destination" });
    await user.type(input, "Richmond");

    const option = await screen.findByText("Richmond Centre", {}, { timeout: 2000 });
    await user.click(option);

    await screen.findByText(/Vancouver, Burnaby, and Surrey/, {}, { timeout: 2000 });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ label: "Richmond Centre" }));
  });
});
