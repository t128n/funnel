/**
 * Request descriptions for the personal day-plan API.
 *
 * The day model and the routes share camelCase block fields; these helpers pin
 * the exact bodies `PUT /api/me/day-plan` and `POST /api/me/day-plan/auto`
 * accept so the UI cannot drift from the T6 contract.
 */
import { describe, expect, test } from "bun:test";
import type { DayBlockInput } from "#lib/planning/day-plan";
import {
  autoPlanRequest,
  dayErrorMessage,
  saveDayRequest,
} from "./day-plan-request";

const DATE = "2026-10-25";

const BLOCKS: DayBlockInput[] = [
  {
    startMinute: 540,
    minutes: 120,
    kind: "issue",
    org: "acme",
    name: "core",
    issueNumber: 12,
  },
  {
    startMinute: 660,
    minutes: 60,
    kind: "buffer",
    org: null,
    name: null,
    issueNumber: null,
  },
];

describe("day-plan requests", () => {
  test("test_requests_save", () => {
    expect(saveDayRequest(DATE, BLOCKS)).toEqual({
      url: "/api/me/day-plan",
      method: "PUT",
      body: JSON.stringify({ date: DATE, blocks: BLOCKS }),
    });
  });

  test("test_requests_clear", () => {
    expect(saveDayRequest(DATE, [])).toEqual({
      url: "/api/me/day-plan",
      method: "PUT",
      body: JSON.stringify({ date: DATE, blocks: [] }),
    });
  });

  test("strips stored ids and dates from blocks", () => {
    const persisted = { ...BLOCKS[0]!, id: "block-1", date: DATE };
    const request = saveDayRequest(DATE, [persisted]);
    expect(JSON.parse(request.body)).toEqual({ date: DATE, blocks: [BLOCKS[0]!] });
  });

  test("test_requests_auto", () => {
    expect(autoPlanRequest(DATE)).toEqual({
      url: "/api/me/day-plan/auto",
      method: "POST",
      body: JSON.stringify({ date: DATE }),
    });
  });
});

describe("day error messages", () => {
  test("test_errors_400_verbatim", () => {
    expect(
      dayErrorMessage(400, { message: "Blocks overlap at 09:30" }),
    ).toBe("Blocks overlap at 09:30");
  });

  test("test_errors_401_sign_in", () => {
    expect(dayErrorMessage(401, { message: "Not authenticated" })).toBe(
      "Sign in again",
    );
  });

  test("falls back to the status when the body has no message", () => {
    expect(dayErrorMessage(500, null)).toBe("Could not save the day (500).");
    expect(dayErrorMessage(400, { message: "" })).toBe(
      "Could not save the day (400).",
    );
  });
});
