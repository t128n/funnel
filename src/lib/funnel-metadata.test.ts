import { describe, expect, test } from "bun:test";
import {
  composeFunnelMetadata,
  formatBlockComment,
  formatEpicRef,
  formatUnblockComment,
  parseEpicRef,
  readBlocked,
  readEpicChildren,
  splitFunnelMetadata,
  writeBlocked,
  writeEpicChildren,
  type BlockInfo,
} from "./funnel-metadata";

const INFO: BlockInfo = {
  blocker: "Waiting on the upstream API key",
  needs: "Platform team to issue a scoped token",
  trying: "Working against the sandbox key for now",
  recheck: "2026-11-01",
  reason: "dependency",
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
      reason: "external",
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

describe("block reason", () => {
  test("round-trips the structured reason", () => {
    const body = writeBlocked("desc", { ...INFO, reason: "dependency" });
    expect(body).toContain('reason: "dependency"');
    expect(readBlocked(body).info?.reason).toBe("dependency");
  });

  test("defaults a legacy block without a reason to other", () => {
    const body = `desc\n\n<!-- funnel_metadata\nblocked:\n  is_blocked: true\n  blocker: "b"\n  needs: "n"\n  trying: ""\n  recheck: ""\n-->`;
    expect(readBlocked(body).info?.reason).toBe("other");
  });

  test("defaults an unknown reason to other", () => {
    const body = `desc\n\n<!-- funnel_metadata\nblocked:\n  is_blocked: true\n  blocker: "b"\n  needs: "n"\n  trying: ""\n  recheck: ""\n  reason: "nonsense"\n-->`;
    expect(readBlocked(body).info?.reason).toBe("other");
  });

  test("preserves an existing reason when a rewrite omits it", () => {
    const blocked = writeBlocked("desc", { ...INFO, reason: "review" });
    const rescheduled = writeBlocked(blocked, {
      blocker: INFO.blocker,
      needs: INFO.needs,
      trying: INFO.trying,
      recheck: "2026-12-01",
    });
    expect(readBlocked(rescheduled).info).toEqual({
      ...INFO,
      recheck: "2026-12-01",
      reason: "review",
    });
  });
});

describe("epic refs", () => {
  test("parses a well-formed ref", () => {
    expect(parseEpicRef("orgA/core#12")).toEqual({
      owner: "orgA",
      name: "core",
      number: 12,
    });
  });

  test("rejects malformed refs", () => {
    for (const raw of [
      "nope",
      "orgA/core",
      "orgA/core#",
      "orgA/core#0",
      "orgA/core#-1",
      "orgA/core#1x",
      "orgA#1",
      "/core#1",
      "orgA/core#1 ",
    ]) {
      expect(parseEpicRef(raw)).toBeNull();
    }
  });

  test("formats a ref", () => {
    expect(formatEpicRef({ owner: "orgA", name: "core", number: 7 })).toBe(
      "orgA/core#7",
    );
  });
});

describe("epic children", () => {
  test("round-trips children in order", () => {
    const body = writeEpicChildren("Epic description", [
      "orgA/core#1",
      "orgA/web#2",
    ]);
    expect(body).toContain("epic:");
    expect(body).toContain('children: "orgA/core#1,orgA/web#2"');
    expect(readEpicChildren(body)).toEqual(["orgA/core#1", "orgA/web#2"]);
  });

  test("drops malformed and self references", () => {
    const body = writeEpicChildren("Epic", [
      "nope",
      "orgA/core#0",
      "orgA/core#1",
      "self/repo#9",
      "orgA/web#2",
    ]);
    expect(readEpicChildren(body, "self/repo#9")).toEqual([
      "orgA/core#1",
      "orgA/web#2",
    ]);
    expect(
      readEpicChildren(body, { owner: "self", name: "repo", number: 9 }),
    ).toEqual(["orgA/core#1", "orgA/web#2"]);
  });

  test("deduplicates repeated refs", () => {
    const body = writeEpicChildren("Epic", ["orgA/core#1", "orgA/core#1"]);
    expect(readEpicChildren(body)).toEqual(["orgA/core#1"]);
  });

  test("removes the section when the list is empty", () => {
    const withChildren = writeEpicChildren("Epic", ["orgA/core#1"]);
    const cleared = writeEpicChildren(withChildren, []);
    expect(readEpicChildren(cleared)).toEqual([]);
    expect(cleared).not.toContain("epic:");
    expect(cleared).toContain("Epic");
  });

  test("does not add an envelope when clearing a body without one", () => {
    expect(writeEpicChildren("plain body", [])).toBe("plain body");
  });

  test("preserves the blocked section", () => {
    const blocked = writeBlocked("Desc", INFO);
    const withChildren = writeEpicChildren(blocked, [
      "orgA/core#1",
      "orgA/web#2",
    ]);
    expect(readBlocked(withChildren)).toEqual({
      isBlocked: true,
      info: INFO,
    });
    expect(readEpicChildren(withChildren)).toEqual([
      "orgA/core#1",
      "orgA/web#2",
    ]);

    const blockedAgain = writeBlocked(withChildren, {
      ...INFO,
      recheck: "2026-12-01",
    });
    expect(readEpicChildren(blockedAgain)).toEqual([
      "orgA/core#1",
      "orgA/web#2",
    ]);
  });

  test("removes the envelope when only the epic section is left", () => {
    const withChildren = writeEpicChildren("Epic", ["orgA/core#1"]);
    const cleared = writeEpicChildren(withChildren, []);
    expect(cleared).toBe("Epic");
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
      reason: "other",
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
