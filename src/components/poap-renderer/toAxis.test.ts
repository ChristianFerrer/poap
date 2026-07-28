import { describe, expect, it } from "vitest";
import { toAxis } from "./toAxis";

describe("toAxis", () => {
  it("maps the 1st of startMonth to 0", () => {
    expect(toAxis(new Date(Date.UTC(2026, 5, 1)), "2026-06")).toBe(0);
  });

  it("maps the 1st of the following month to 1", () => {
    expect(toAxis(new Date(Date.UTC(2026, 6, 1)), "2026-06")).toBe(1);
  });

  it("maps mid-month to roughly half", () => {
    const v = toAxis(new Date(Date.UTC(2026, 5, 16)), "2026-06");
    expect(v).toBeGreaterThan(0.4);
    expect(v).toBeLessThan(0.6);
  });

  it("handles a year boundary", () => {
    expect(toAxis(new Date(Date.UTC(2027, 0, 1)), "2026-06")).toBe(7);
  });
});
