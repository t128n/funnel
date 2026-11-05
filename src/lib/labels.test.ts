import { afterEach, describe, expect, test } from "bun:test";
import {
  buildReservedLabels,
  buildVocabulary,
  CANONICAL_LABELS,
  canonicalLabel,
  canonicalLabelByBase,
  canonicalName,
  DEFAULT_VOCABULARY,
  groupOfLabel,
  isReservedLabel,
  isValidLabelPrefix,
  labelOptions,
  labelTint,
  logicalLabel,
  normalizeLabelPrefix,
  setActiveLabelPrefix,
  SIZE_OPTIONS,
  STATUS_OPTIONS,
} from "./labels";

afterEach(() => {
  setActiveLabelPrefix("");
});

describe("reserved-label vocabulary", () => {
  test("default prefix keeps today's names and logical keys", () => {
    expect(CANONICAL_LABELS.map((label) => label.name)).toEqual([
      "backlog",
      "todo",
      "in-progress",
      "in-review",
      "blocked",
      "sev",
      "mod",
      "min",
      "high",
      "mid",
      "low",
      "sm",
      "md",
      "lg",
      "epic",
    ]);
    for (const label of CANONICAL_LABELS) {
      expect(label.base).toBe(label.name);
      expect(DEFAULT_VOCABULARY.byName.get(label.name)).toBe(label);
    }
  });

  test("a prefix applies to every actual name but preserves logical keys", () => {
    const labels = buildReservedLabels("funnel");
    expect(labels.map((label) => label.name)).toEqual([
      "funnel-backlog",
      "funnel-todo",
      "funnel-in-progress",
      "funnel-in-review",
      "funnel-blocked",
      "funnel-sev",
      "funnel-mod",
      "funnel-min",
      "funnel-high",
      "funnel-mid",
      "funnel-low",
      "funnel-sm",
      "funnel-md",
      "funnel-lg",
      "funnel-epic",
    ]);
    expect(labels.map((label) => label.base)).toEqual(
      CANONICAL_LABELS.map((label) => label.base),
    );
    expect(labels.find((label) => label.base === "todo")?.color).toBe(
      CANONICAL_LABELS.find((label) => label.base === "todo")?.color,
    );
    expect(labels.find((label) => label.base === "epic")?.group).toBe("epic");
  });

  test("normalizes whitespace and trailing hyphens", () => {
    expect(normalizeLabelPrefix("  funnel-  ")).toBe("funnel");
    expect(normalizeLabelPrefix("funnel--")).toBe("funnel");
    expect(normalizeLabelPrefix("---")).toBe("");
    expect(buildReservedLabels("funnel-").map((label) => label.name)).toContain(
      "funnel-todo",
    );
  });

  test("accepts only safe prefixes", () => {
    for (const valid of ["", "funnel", "funnel-2", "a1-B2"]) {
      expect(isValidLabelPrefix(valid)).toBe(true);
    }
    for (const invalid of ["funnel_2", "funnel 2", "funnel/2", "-funnel", "funnel--2", "x".repeat(33)]) {
      expect(isValidLabelPrefix(invalid)).toBe(false);
    }
  });

  test("looks labels up by actual name and by logical key", () => {
    const vocabulary = buildVocabulary("funnel");
    const todo = canonicalLabel("FUNNEL-TODO", vocabulary);
    expect(todo?.base).toBe("todo");
    expect(canonicalName("todo", vocabulary)).toBe("funnel-todo");
    expect(logicalLabel("funnel-todo", vocabulary)).toBe("todo");
    expect(canonicalLabelByBase("todo", vocabulary)?.name).toBe("funnel-todo");
    expect(groupOfLabel("funnel-todo", vocabulary)).toBe("status");
    expect(isReservedLabel("funnel-todo", vocabulary)).toBe(true);
    expect(isReservedLabel("funnel-blocked", vocabulary)).toBe(true);
  });

  test("old unprefixed names become ordinary labels under a prefix", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(canonicalLabel("todo", vocabulary)).toBeUndefined();
    expect(isReservedLabel("todo", vocabulary)).toBe(false);
    expect(logicalLabel("todo", vocabulary)).toBeUndefined();
  });

  test("options keep logical values and human labels", () => {
    const vocabulary = buildVocabulary("funnel");
    expect(labelOptions("size", { sm: "S", md: "M", lg: "L" }, vocabulary)).toEqual([
      { value: "sm", label: "S", color: "6aab73" },
      { value: "md", label: "M", color: "2aacb8" },
      { value: "lg", label: "L", color: "e28d78" },
    ]);
    expect(STATUS_OPTIONS.map((option) => option.value)).toEqual([
      "backlog",
      "todo",
      "in-progress",
      "in-review",
    ]);
    expect(SIZE_OPTIONS.map((option) => option.value)).toEqual(["sm", "md", "lg"]);
  });

  test("active prefix drives client display lookups", () => {
    setActiveLabelPrefix("funnel");
    expect(canonicalLabel("funnel-todo")?.base).toBe("todo");
    expect(labelTint("sm")).toBe("color: #6aab73");
    expect(labelTint("funnel-md")).toBe("color: #2aacb8");
    expect(labelTint("wat")).toBeUndefined();
  });
});
