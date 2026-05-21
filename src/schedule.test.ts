import { describe, expect, test } from "bun:test";
import { nextFireTime } from "./schedule";

const at = (h: number, m: number, s = 0): Date => {
  const d = new Date(2026, 4, 21, h, m, s);
  return d;
};

describe("nextFireTime", () => {
  test("returns null when no times are configured", () => {
    expect(nextFireTime(at(10, 0), [])).toBeNull();
  });

  test("returns null when every configured time is invalid", () => {
    expect(nextFireTime(at(10, 0), ["not-a-time", "25:00", "9"])).toBeNull();
  });

  test("returns today's next upcoming time when one is still ahead", () => {
    const next = nextFireTime(at(10, 0), ["09:00", "13:00", "18:00"]);
    expect(next).toEqual(at(13, 0));
  });

  test("rolls to tomorrow when every configured time has passed today", () => {
    const next = nextFireTime(at(20, 0), ["09:00", "13:00", "18:00"]);
    const expected = new Date(2026, 4, 22, 9, 0, 0);
    expect(next).toEqual(expected);
  });

  test("treats an exact match on the minute as already passed", () => {
    const next = nextFireTime(at(9, 0, 0), ["09:00", "13:00"]);
    expect(next).toEqual(at(13, 0));
  });

  test("ignores invalid entries but uses the valid ones", () => {
    const next = nextFireTime(at(10, 0), ["bogus", "13:00", "99:99"]);
    expect(next).toEqual(at(13, 0));
  });

  test("accepts unsorted input and finds the earliest upcoming time", () => {
    const next = nextFireTime(at(10, 0), ["18:00", "11:30", "13:00"]);
    expect(next).toEqual(at(11, 30));
  });

  test("handles HH:MM with leading zeros", () => {
    const next = nextFireTime(at(7, 0), ["08:05"]);
    expect(next).toEqual(at(8, 5));
  });
});
