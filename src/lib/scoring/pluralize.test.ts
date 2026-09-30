import { describe, expect, it } from "vitest";
import { formatCount, pluralize } from "./pluralize";

describe("pluralize", () => {
  it("uses the singular form for a count of exactly 1", () => {
    expect(pluralize(1, "alert")).toBe("alert");
  });

  it("uses the default 's'-suffixed plural for any other count", () => {
    expect(pluralize(0, "alert")).toBe("alerts");
    expect(pluralize(2, "alert")).toBe("alerts");
  });

  it("uses a supplied irregular plural instead of the default 's' suffix", () => {
    expect(pluralize(1, "is", "are")).toBe("is");
    expect(pluralize(2, "is", "are")).toBe("are");
  });
});

describe("formatCount", () => {
  it("formats a count of 1 as '1 minute', never '1 minute(s)'", () => {
    expect(formatCount(1, "minute")).toBe("1 minute");
  });

  it("formats a count greater than 1 as '2 minutes'", () => {
    expect(formatCount(2, "minute")).toBe("2 minutes");
  });

  it("formats a count of 1 event/segment/alert correctly", () => {
    expect(formatCount(1, "event")).toBe("1 event");
    expect(formatCount(1, "segment")).toBe("1 segment");
    expect(formatCount(1, "alert")).toBe("1 alert");
  });

  it("formats a count greater than 1 event/segment/alert correctly", () => {
    expect(formatCount(2, "event")).toBe("2 events");
    expect(formatCount(2, "segment")).toBe("2 segments");
    expect(formatCount(3, "alert")).toBe("3 alerts");
  });
});
