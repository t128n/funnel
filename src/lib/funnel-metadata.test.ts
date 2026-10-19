import { describe, expect, test } from "bun:test";
import {
  composeFunnelMetadata,
  formatBlockComment,
  formatUnblockComment,
  readBlocked,
  readImpactUrgency,
  readPriorityInputs,
  splitFunnelMetadata,
  writeBlocked,
  writeImpactUrgency,
  writePriorityInputs,
  type BlockInfo,
} from "./funnel-metadata";

const INFO: BlockInfo = {
  blocker: "Waiting on the upstream API key",
  needs: "Platform team to issue a scoped token",
  trying: "Working against the sandbox key for now",
  recheck: "2026-11-01",
};

describe("splitFunnelMetadata", () => {
  test("returns the body unchanged when there is no envelope", () => {
    expect(splitFunnelMetadata("Just a body")).toEqual({
      content: "Just a body",
      block: null,
    });
  });

  test("separates the trailing envelope from the content", () => {
    const body = `Steps to reproduce\n\n<!-- funnel_metadata\nblocked:\n  is_blocked: false\n-->`;
    const { content, block } = splitFunnelMetadata(body);
    expect(content).toBe("Steps to reproduce");
    expect(block).toContain("funnel_metadata");
  });

  test("round-trips through compose", () => {
    const body = `Hello\n\n<!-- funnel_metadata\nblocked:\n  is_blocked: false\n-->`;
    const { content, block } = splitFunnelMetadata(body);
    expect(composeFunnelMetadata(content, block)).toBe(body);
  });
});

describe("writeBlocked / readBlocked", () => {
  test("writes and reads the structured blocker", () => {
    const body = writeBlocked("Original description", INFO);
    const state = readBlocked(body);
    expect(state.isBlocked).toBe(true);
    expect(state.info).toEqual(INFO);
  });

  test("escapes values that contain YAML-significant characters", () => {
    const tricky: BlockInfo = {
      blocker: 'Token "quoted" and: colon\nsecond line',
      needs: "#hash",
      trying: "",
      recheck: "",
    };
    const state = readBlocked(writeBlocked("body", tricky));
    expect(state.info).toEqual(tricky);
  });

  test("keeps is_blocked false and clears fields on unblock", () => {
    const blocked = writeBlocked("body", INFO);
    const cleared = writeBlocked(blocked, null);
    expect(readBlocked(cleared)).toEqual({ isBlocked: false, info: null });
    expect(cleared).toContain("is_blocked: false");
    expect(cleared).not.toContain("upstream API key");
  });

  test("reports unblocked for a body with no metadata", () => {
    expect(readBlocked("plain body")).toEqual({ isBlocked: false, info: null });
  });

  test("does not add an envelope when clearing a body that has none", () => {
    expect(writeBlocked("plain body", null)).toBe("plain body");
  });
});

describe("writePriorityInputs / readPriorityInputs", () => {
  test("round-trips both axes under a priority section", () => {
    const body = writePriorityInputs("Original description", {
      impact: 2,
      urgency: 3,
    });
    expect(body).toContain("priority:\n  impact: 2\n  urgency: 3");
    expect(readPriorityInputs(body)).toEqual({ impact: 2, urgency: 3 });
    expect(readImpactUrgency(body)).toEqual({ impact: 2, urgency: 3 });
  });

  test("stores only the axes that are set", () => {
    const body = writePriorityInputs("body", { impact: 1, urgency: null });
    expect(body).toContain("impact: 1");
    expect(body).not.toContain("urgency:");
    expect(readPriorityInputs(body)).toEqual({ impact: 1, urgency: null });
  });

  test("preserves blocker metadata while changing the axes", () => {
    const blocked = writeBlocked("body", INFO);
    const withPriority = writePriorityInputs(blocked, {
      impact: 4,
      urgency: 2,
    });
    expect(readBlocked(withPriority).info).toEqual(INFO);
    expect(readPriorityInputs(withPriority)).toEqual({
      impact: 4,
      urgency: 2,
    });
  });

  test("blocking preserves the axes already recorded", () => {
    const axes = writePriorityInputs("body", { impact: 3, urgency: 1 });
    const blocked = writeBlocked(axes, INFO);
    expect(readPriorityInputs(blocked)).toEqual({ impact: 3, urgency: 1 });
    expect(readBlocked(blocked).info).toEqual(INFO);
  });

  test("clearing both axes keeps an unrelated blocked section", () => {
    const body = writePriorityInputs(writeBlocked("body", INFO), {
      impact: 2,
      urgency: 2,
    });
    const cleared = writePriorityInputs(body, { impact: null, urgency: null });
    expect(readPriorityInputs(cleared)).toEqual({ impact: null, urgency: null });
    expect(cleared).not.toContain("priority:");
    expect(readBlocked(cleared).info).toEqual(INFO);
  });

  test("clearing axes on a metadata-free body is a no-op", () => {
    expect(
      writePriorityInputs("plain body", { impact: null, urgency: null }),
    ).toBe("plain body");
  });

  test("clearing the only section removes the envelope", () => {
    const body = writePriorityInputs("plain body", {
      impact: 1,
      urgency: 1,
    });
    expect(
      writePriorityInputs(body, { impact: null, urgency: null }),
    ).toBe("plain body");
  });

  test("accepts the legacy top-level form and rewrites it canonically", () => {
    const legacy = `body\n\n<!-- funnel_metadata\nimpact: 2\nurgency: 4\n-->`;
    expect(readPriorityInputs(legacy)).toEqual({ impact: 2, urgency: 4 });
    const rewritten = writePriorityInputs(legacy, {
      impact: 2,
      urgency: 4,
    });
    expect(rewritten).toContain("priority:\n  impact: 2\n  urgency: 4");
    expect(rewritten).not.toContain("\nimpact: 2");
  });

  test("ignores malformed and out-of-range values", () => {
    const body = `body\n\n<!-- funnel_metadata\npriority:\n  impact: 9\n  urgency: "2"\n-->`;
    expect(readPriorityInputs(body)).toEqual({ impact: null, urgency: 2 });
  });

  test("aliases writeImpactUrgency", () => {
    const body = writeImpactUrgency("body", { impact: 1, urgency: 4 });
    expect(readPriorityInputs(body)).toEqual({ impact: 1, urgency: 4 });
  });
});

describe("comment formatting", () => {
  test("lists every provided field", () => {
    const comment = formatBlockComment(INFO);
    expect(comment).toContain("### 🚫 Blocked");
    expect(comment).toContain("**Blocker:** Waiting on the upstream API key");
    expect(comment).toContain("**Needs to unblock:** Platform team");
    expect(comment).toContain("**Currently trying:** Working against the sandbox key");
    expect(comment).toContain("**Re-check:** 2026-11-01");
  });

  test("omits empty optional fields", () => {
    const comment = formatBlockComment({
      blocker: "b",
      needs: "n",
      trying: "",
      recheck: "",
    });
    expect(comment).not.toContain("Currently trying");
    expect(comment).not.toContain("Re-check");
  });

  test("formats the unblock comment", () => {
    expect(formatUnblockComment("Key arrived")).toBe(
      "### ✅ Unblocked\n\nKey arrived",
    );
  });
});
