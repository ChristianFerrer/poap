import { describe, expect, it } from "vitest";
import { fromAxis, toAxis } from "./toAxis";

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

describe("fromAxis", () => {
  it("inverts 0 back to the 1st of startMonth", () => {
    const d = fromAxis(0, "2026-06");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(1);
  });

  it("inverts a year boundary back correctly", () => {
    const d = fromAxis(7, "2026-06");
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it("round-trips toAxis within a day for arbitrary dates", () => {
    const original = new Date(Date.UTC(2026, 10, 16));
    const position = toAxis(original, "2026-06");
    const back = fromAxis(position, "2026-06");
    const diffDays = Math.abs(back.getTime() - original.getTime()) / 86_400_000;
    expect(diffDays).toBeLessThanOrEqual(1);
  });
});
