import { describe, expect, it } from "vitest";
import { parseCsvLine, parseCsvTable, streamCsvRows } from "./csv";

describe("parseCsvLine", () => {
  it("splits a simple unquoted line", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("handles escaped double quotes inside a quoted field", () => {
    expect(parseCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });

  it("handles empty fields", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("parseCsvTable", () => {
  it("parses a header + rows into header-keyed objects", () => {
    const text = "route_id,route_short_name\nR001,099\nR002,R5\n";
    expect(parseCsvTable(text)).toEqual([
      { route_id: "R001", route_short_name: "099" },
      { route_id: "R002", route_short_name: "R5" },
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = "a,b\r\n1,2\r\n";
    expect(parseCsvTable(text)).toEqual([{ a: "1", b: "2" }]);
  });

  it("ignores a trailing blank line", () => {
    const text = "a,b\n1,2\n\n";
    expect(parseCsvTable(text)).toEqual([{ a: "1", b: "2" }]);
  });

  it("returns an empty array for an empty table", () => {
    expect(parseCsvTable("")).toEqual([]);
  });

  it("fills a missing trailing column with an empty string", () => {
    const text = "a,b,c\n1,2\n";
    expect(parseCsvTable(text)).toEqual([{ a: "1", b: "2", c: "" }]);
  });
});

describe("streamCsvRows", () => {
  it("yields the same rows as parseCsvTable", () => {
    const text = "a,b\n1,2\n3,4\n";
    expect([...streamCsvRows(text)]).toEqual(parseCsvTable(text));
  });

  it("yields nothing for an empty table", () => {
    expect([...streamCsvRows("")]).toEqual([]);
  });
});
