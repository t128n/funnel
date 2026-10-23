import { describe, expect, test } from "bun:test";
import {
  composeFunnelMetadata,
  formatBlockComment,
  formatUnblockComment,
  readBlocked,
  splitFunnelMetadata,
  writeBlocked,
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
