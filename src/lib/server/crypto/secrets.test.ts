import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "./secrets";

describe("secret encryption", () => {
  test("round-trips a value", () => {
    const envelope = encryptSecret("super-secret-pem");
    expect(envelope).not.toContain("super-secret-pem");
    expect(decryptSecret(envelope)).toBe("super-secret-pem");
  });

  test("uses a fresh IV per call", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  test("handles multi-line PEM payloads", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
    expect(decryptSecret(encryptSecret(pem))).toBe(pem);
  });

  test("rejects a malformed envelope", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow();
  });

  test("rejects tampered ciphertext (GCM auth)", () => {
    const [iv, tag] = encryptSecret("hello").split(":");
    const tampered = [iv, tag, Buffer.from("tampered").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
