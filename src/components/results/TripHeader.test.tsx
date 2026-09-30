// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { TripRequest } from "@/lib/trip/types";
import { route, segment } from "./fixtures";
import { TripHeader } from "./TripHeader";

afterEach(cleanup);

const testRoute = route([segment({ mode: "drive" })], {
  origin: { label: "SFU Burnaby", latitude: 49.28, longitude: -122.92 },
  destination: { label: "Downtown Vancouver", latitude: 49.28, longitude: -123.12 },
});

const tripRequest: TripRequest = {
  origin: testRoute.origin,
  destination: testRoute.destination,
  timePreference: "arriveBy",
  dateTime: new Date("2026-09-25T16:00:00Z"),
  mode: "car",
};

describe("TripHeader — readability over the (uncarded) weather scene", () => {
  it("renders the origin/destination line with a readability text-shadow, since no card sits behind it", () => {
    render(<TripHeader tripRequest={tripRequest} route={testRoute} onEditTrip={() => {}} />);
    const heading = screen.getByText("SFU Burnaby").parentElement;
    expect(heading?.className).toMatch(/text-shadow/);
  });

  it("gives the 'Edit trip' button a real background fill, not just a bare border, for the same reason", () => {
    render(<TripHeader tripRequest={tripRequest} route={testRoute} onEditTrip={() => {}} />);
    const button = screen.getByRole("button", { name: "Edit trip" });
    expect(button.className).toMatch(/bg-white\/\[/);
  });
});
