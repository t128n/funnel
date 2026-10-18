import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { encodeSubmitDeeplinkQuery } from "#lib/client/intake-deeplink";
import { INTAKE_BODY_MAX, INTAKE_DEEPLINK_MAX, INTAKE_TITLE_MAX } from "#lib/intake-prefill";
import { readSubmissionPrefill } from "#lib/server/intake/prefill";

function decode(query: string) {
  return readSubmissionPrefill(new URLSearchParams(query));
}

/** Printable, effectively incompressible text for the over-cap case. */
function randomText(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String.fromCharCode(33 + (byte % 94))).join("");
}

describe("submit deeplink encoding", () => {
  test("round-trips a large payload through the compact encoding", async () => {
    const input = {
      title: "Crash on 💥 save",
      body: "Step one.\nStep two.\n".repeat(40),
      source: "email",
    };
    const query = await encodeSubmitDeeplinkQuery(input);

    expect(query).not.toBeNull();
    expect(query!.startsWith("d=")).toBe(true);
    expect(decode(query!)).toEqual(input);
  });

  test("falls back to plain params for tiny drafts", async () => {
    expect(await encodeSubmitDeeplinkQuery({ title: "Hi", body: "", source: "" })).toBe("title=Hi");
  });

  test("preserves unknown sources and normalises known ones", async () => {
    const unknown = await encodeSubmitDeeplinkQuery({ title: "T", body: "B", source: "slack" });
    expect(decode(unknown!).source).toBe("slack");

    const known = await encodeSubmitDeeplinkQuery({ title: "T", body: "B", source: "EMAIL" });
    expect(decode(known!).source).toBe("email");
  });

  test("returns null when there is nothing to share", async () => {
    expect(await encodeSubmitDeeplinkQuery({ title: "   ", body: "", source: "" })).toBeNull();
    expect(await encodeSubmitDeeplinkQuery({ title: "", body: "", source: "" })).toBeNull();
  });

  test("clamps long titles before encoding", async () => {
    const query = await encodeSubmitDeeplinkQuery({
      title: "t".repeat(INTAKE_TITLE_MAX + 50),
      body: "",
      source: "",
    });

    expect(decode(query!).title).toHaveLength(INTAKE_TITLE_MAX);
  });

  test("refuses links that exceed the deeplink cap", async () => {
    const query = await encodeSubmitDeeplinkQuery({
      title: "",
      body: randomText(9_000),
      source: "",
    });

    expect(query).toBeNull();
  });
});

describe("submit deeplink decoding", () => {
  test("decodes the documented wire format", () => {
    const json = JSON.stringify({ t: "Wire", b: "Body", s: "meeting" });
    const encoded = deflateRawSync(Buffer.from(json, "utf8")).toString("base64url");

    expect(readSubmissionPrefill(new URLSearchParams({ d: encoded }))).toEqual({
      title: "Wire",
      body: "Body",
      source: "meeting",
    });
  });

  test("falls back to plain params when d is malformed", () => {
    const bogus = deflateRawSync(Buffer.from("not json", "utf8")).toString("base64url");

    expect(readSubmissionPrefill(new URLSearchParams({ d: bogus, body: "Plain body" }))).toEqual({
      title: "",
      body: "Plain body",
      source: "",
    });
  });

  test("ignores an oversized d param", () => {
    const params = new URLSearchParams({
      d: "a".repeat(INTAKE_DEEPLINK_MAX + 1),
      title: "Fallback",
    });

    expect(readSubmissionPrefill(params)).toEqual({ title: "Fallback", body: "", source: "" });
  });

  test("rejects a payload that inflates past the cap", () => {
    const huge = JSON.stringify({ b: "a".repeat(INTAKE_BODY_MAX + 50_000) });
    const encoded = deflateRawSync(Buffer.from(huge, "utf8")).toString("base64url");
    const params = new URLSearchParams({ d: encoded, title: "Fallback" });

    expect(readSubmissionPrefill(params)).toEqual({ title: "Fallback", body: "", source: "" });
  });

  test("plain params still work without a deeplink", () => {
    expect(readSubmissionPrefill(new URLSearchParams("title=T&body=B&source=WALK-IN"))).toEqual({
      title: "T",
      body: "B",
      source: "walk-in",
    });
  });
});
