import { describe, expect, test } from "bun:test";
import {
  hasSubmitPrefill,
  INTAKE_BODY_MAX,
  INTAKE_SOURCE_MAX,
  INTAKE_TITLE_MAX,
  normalizeIntakeSource,
  readSubmitPrefill,
} from "#lib/intake-prefill";

describe("readSubmitPrefill", () => {
  test("returns empty values when no params are present", () => {
    expect(readSubmitPrefill(new URLSearchParams())).toEqual({
      title: "",
      body: "",
      source: "",
    });
  });

  test("trims title and source but preserves body formatting", () => {
    const params = new URLSearchParams({
      title: "  Crash on save  ",
      body: "  line one\nline two  ",
      source: "  CLI  ",
    });

    expect(readSubmitPrefill(params)).toEqual({
      title: "Crash on save",
      body: "  line one\nline two  ",
      source: "cli",
    });
  });

  test("clamps every value to its intake limit", () => {
    const params = new URLSearchParams({
      title: "t".repeat(INTAKE_TITLE_MAX + 10),
      body: "b".repeat(INTAKE_BODY_MAX + 10),
      source: "s".repeat(INTAKE_SOURCE_MAX + 10),
    });
    const prefill = readSubmitPrefill(params);

    expect(prefill.title).toHaveLength(INTAKE_TITLE_MAX);
    expect(prefill.body).toHaveLength(INTAKE_BODY_MAX);
    expect(prefill.source).toHaveLength(INTAKE_SOURCE_MAX);
  });
});

describe("normalizeIntakeSource", () => {
  test("matches known sources case-insensitively", () => {
    expect(normalizeIntakeSource("Email")).toBe("email");
    expect(normalizeIntakeSource("  cLi  ")).toBe("cli");
  });

  test("preserves unknown provenance labels", () => {
    expect(normalizeIntakeSource("  sLaCk ")).toBe("sLaCk");
    expect(normalizeIntakeSource("   ")).toBe("");
  });
});

describe("hasSubmitPrefill", () => {
  test("is true only when at least one value is present", () => {
    expect(hasSubmitPrefill({ title: "", body: "", source: "" })).toBe(false);
    expect(hasSubmitPrefill({ title: "x", body: "", source: "" })).toBe(true);
    expect(hasSubmitPrefill({ title: "", body: "x", source: "" })).toBe(true);
    expect(hasSubmitPrefill({ title: "", body: "", source: "cli" })).toBe(true);
  });
});
