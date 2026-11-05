import { beforeEach, describe, expect, test } from "bun:test";
import { get } from "svelte/store";
import {
  closeQuickCreate,
  dismissQuickCreateSuccess,
  normalizeQuickCreatePrefill,
  openQuickCreate,
  quickCreate,
  reportQuickCreateSuccess,
  resetQuickCreate,
} from "./quick-create";

beforeEach(() => {
  resetQuickCreate();
});

describe("normalizeQuickCreatePrefill", () => {
  test("keeps an open workflow status and a trimmed repo", () => {
    expect(
      normalizeQuickCreatePrefill({ repo: "  t128n/funnel  ", status: "todo" }),
    ).toEqual({ repo: "t128n/funnel", status: "todo" });
  });

  test("drops Done because it is a closed window, not a status label", () => {
    expect(normalizeQuickCreatePrefill({ status: "done" })).toEqual({});
  });

  test("drops blank values and unknown statuses", () => {
    expect(
      normalizeQuickCreatePrefill({ repo: "   ", status: "not-a-status" }),
    ).toEqual({});
  });

  test("accepts every open status the API offers", () => {
    for (const status of ["backlog", "todo", "in-progress", "in-review"]) {
      expect(normalizeQuickCreatePrefill({ status })).toEqual({ status });
    }
  });
});

describe("quick-create store", () => {
  test("starts closed with no prefill", () => {
    expect(get(quickCreate)).toEqual({ open: false, prefill: {}, success: null });
  });

  test("opening applies the surface prefill", () => {
    openQuickCreate({ repo: "t128n/funnel", status: "in-review" });
    expect(get(quickCreate).open).toBe(true);
    expect(get(quickCreate).prefill).toEqual({
      repo: "t128n/funnel",
      status: "in-review",
    });
  });

  test("opening without context leaves the dialog's defaults in charge", () => {
    openQuickCreate();
    expect(get(quickCreate)).toEqual({ open: true, prefill: {}, success: null });
  });

  test("a board Done column does not invent a status", () => {
    openQuickCreate({ status: "done" });
    expect(get(quickCreate).prefill).toEqual({});
  });

  test("closing hides the dialog without losing the prefill", () => {
    openQuickCreate({ status: "todo" });
    closeQuickCreate();
    expect(get(quickCreate).open).toBe(false);
    expect(get(quickCreate).prefill).toEqual({ status: "todo" });
  });

  test("a successful create closes the dialog and keeps the link", () => {
    openQuickCreate({ status: "todo" });
    reportQuickCreateSuccess({
      repo: "t128n/funnel",
      number: 42,
      htmlUrl: "https://github.com/t128n/funnel/issues/42",
    });
    expect(get(quickCreate)).toEqual({
      open: false,
      prefill: {},
      success: {
        repo: "t128n/funnel",
        number: 42,
        htmlUrl: "https://github.com/t128n/funnel/issues/42",
      },
    });
  });

  test("the confirmation can be dismissed", () => {
    reportQuickCreateSuccess({
      repo: "t128n/funnel",
      number: 7,
      htmlUrl: "https://github.com/t128n/funnel/issues/7",
    });
    dismissQuickCreateSuccess();
    expect(get(quickCreate).success).toBeNull();
  });

  test("opening again clears an older confirmation", () => {
    reportQuickCreateSuccess({
      repo: "t128n/funnel",
      number: 7,
      htmlUrl: "https://github.com/t128n/funnel/issues/7",
    });
    openQuickCreate();
    expect(get(quickCreate).success).toBeNull();
  });
});
