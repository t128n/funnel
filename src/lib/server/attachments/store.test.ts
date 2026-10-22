import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { FUNNEL_UPLOAD_DIR } from "$app/env/private";
import { db } from "#lib/server/db/index";
import { stateAttachment } from "#lib/server/db/schema";
import type { UserRef } from "#lib/server/issues/types";
import {
  deleteAttachment,
  getAttachment,
  listAttachments,
  maxUploadBytes,
  readAttachment,
  sanitizeFilename,
  saveAttachment,
} from "./store";

const UPLOADER: UserRef = {
  externalId: "9",
  forge: "github",
  instance: "github.com",
  login: "uploader",
  avatarUrl: "",
};

const bytes = new TextEncoder().encode("hello world");

async function save(filename = "report.txt") {
  return saveAttachment({
    org: "files-org",
    name: "files-repo",
    issueNumber: 3,
    filename,
    mimeType: "text/plain",
    bytes,
    uploadedBy: UPLOADER,
  });
}

beforeEach(async () => {
  db.delete(stateAttachment).run();
  await rm(resolve(FUNNEL_UPLOAD_DIR), { recursive: true, force: true });
});

afterEach(async () => {
  await rm(resolve(FUNNEL_UPLOAD_DIR), { recursive: true, force: true });
});

describe("attachment store", () => {
  test("writes bytes to disk and stores metadata", async () => {
    const item = await save();
    expect(item.filename).toBe("report.txt");
    expect(item.sizeBytes).toBe(bytes.byteLength);
    expect(item.mimeType).toBe("text/plain");
    expect(item.uploadedBy).toEqual(UPLOADER);

    const download = await readAttachment(item.id);
    expect(download).toBeDefined();
    expect(Buffer.from(download!.data).toString()).toBe("hello world");
    expect(createHash("sha256").update(bytes).digest("hex")).toHaveLength(64);
  });

  test("stores files outside the upload root and never trusts the filename", async () => {
    const item = await save("../../evil.sh");
    const stored = db
      .select()
      .from(stateAttachment)
      .all()
      .find((row) => row.id === item.id);
    expect(stored?.filename).toBe("....evil.sh");
    expect(stored?.storedPath.startsWith("..")).toBe(false);
    expect(existsSync(resolve(FUNNEL_UPLOAD_DIR, stored!.storedPath))).toBe(true);
  });

  test("lists attachments oldest first and scoped to the issue", async () => {
    const first = await save("a.txt");
    const second = await save("b.txt");
    await saveAttachment({
      org: "files-org",
      name: "files-repo",
      issueNumber: 4,
      filename: "c.txt",
      mimeType: "text/plain",
      bytes,
      uploadedBy: null,
    });

    expect(listAttachments("files-org", "files-repo", 3).map((i) => i.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(listAttachments("files-org", "files-repo", 4)).toHaveLength(1);
  });

  test("returns undefined for an unknown attachment", async () => {
    expect(getAttachment("missing")).toBeUndefined();
    expect(await readAttachment("missing")).toBeUndefined();
    expect(await deleteAttachment("missing")).toBeUndefined();
  });

  test("delete removes the row, the file, and reports its issue", async () => {
    const item = await save();
    const stored = db
      .select()
      .from(stateAttachment)
      .all()
      .find((row) => row.id === item.id)!;

    const target = await deleteAttachment(item.id);
    expect(target).toEqual({
      org: "files-org",
      name: "files-repo",
      issueNumber: 3,
    });
    expect(getAttachment(item.id)).toBeUndefined();
    expect(existsSync(resolve(FUNNEL_UPLOAD_DIR, stored.storedPath))).toBe(false);
  });

  test("sanitizes filenames and exposes the configured size cap", () => {
    expect(sanitizeFilename("a/b\\c.txt")).toBe("abc.txt");
    expect(sanitizeFilename("   ")).toBe("attachment");
    expect(maxUploadBytes()).toBe(10 * 1024 * 1024);
  });
});
