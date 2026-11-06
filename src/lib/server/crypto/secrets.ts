/**
 * Symmetric encryption for GitHub App secrets at rest (SPEC §8).
 *
 * The App credentials captured by the manifest flow (`client_secret` and the
 * RSA `pem`) are stored in the SQLite `state_github_app` row. They are
 * encrypted with a key derived from `FUNNEL_SECRET` using AES-256-GCM (an
 * AEAD, so the ciphertext is authenticated as well as confidential). The
 * envelope is `iv:tag:ciphertext`, all base64.
 *
 * `FUNNEL_SECRET` is mandatory and at least 32 characters (see `src/env.ts`),
 * so a stolen database file alone cannot recover the private key.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { FUNNEL_SECRET } from "$app/env/private";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

// scrypt is deliberately slow; derive once per process. The fixed salt is
// fine here: the secret is high-entropy and this is not password storage.
const KEY = scryptSync(FUNNEL_SECRET, "funnel/github-app/secret", 32);

/** Encrypt a UTF-8 string into a self-describing `iv:tag:ciphertext` envelope. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Reverse {@link encryptSecret}. Throws on a tampered or malformed envelope. */
export function decryptSecret(envelope: string): string {
  const [ivPart, tagPart, dataPart] = envelope.split(":");
  if (!ivPart || !tagPart || dataPart === undefined) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
