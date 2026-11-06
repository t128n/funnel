import { describe, expect, test } from "bun:test";
import { sealManifestState, unsealManifestState } from "./manifest-state.server";

const PAYLOAD = {
  state: "state-123",
  github: {
    url: "https://acme.ghe.com",
    api_url: "https://acme.ghe.com/api/v3",
  },
};

describe("manifest state cookie", () => {
  test("round-trips the state and selected host", () => {
    expect(unsealManifestState(sealManifestState(PAYLOAD))).toEqual(PAYLOAD);
  });

  test("rejects tampered payloads and signatures", () => {
    const sealed = sealManifestState(PAYLOAD);
    const [body, signature] = sealed.split(".");
    expect(unsealManifestState(`${body}x.${signature}`)).toBeNull();
    expect(unsealManifestState(`${body}.${signature}x`)).toBeNull();
    expect(unsealManifestState("not-a-cookie")).toBeNull();
    expect(unsealManifestState("a.b.c")).toBeNull();
  });

  test("rejects an unsigned legacy value", () => {
    expect(unsealManifestState(PAYLOAD.state)).toBeNull();
  });
});
