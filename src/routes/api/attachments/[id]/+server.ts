import type { RequestHandler } from "./$types";
import { deleteAttachment, readAttachment } from "#lib/server/attachments/store";
import { apiSession } from "#lib/server/http/session";
import { publish } from "#lib/server/sync/events";

/** RFC 6266 disposition value: ASCII fallback plus a UTF-8 `filename*`. */
function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Stream one attachment's bytes (session-gated). */
export const GET: RequestHandler = async ({ params, locals }) => {
  const denied = apiSession(locals);
  if (denied instanceof Response) return denied;

  const download = await readAttachment(params.id);
  if (!download) {
    return Response.json({ message: "Attachment not found" }, { status: 404 });
  }

  const { item, data } = download;
  return new Response(data as unknown as BodyInit, {
    headers: {
      "Content-Type": item.mimeType || "application/octet-stream",
      "Content-Length": String(item.sizeBytes),
      "Content-Disposition": contentDisposition(item.filename),
      // Never sniff: the stored type is untrusted and files are downloads.
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
};

/** Delete an attachment (metadata row + file). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const denied = apiSession(locals);
  if (denied instanceof Response) return denied;

  const target = await deleteAttachment(params.id);
  if (!target) {
    return Response.json({ message: "Attachment not found" }, { status: 404 });
  }
  publish({
    type: "issues",
    repo: `${target.org}/${target.name}`,
    numbers: [target.issueNumber],
  });
  return new Response(null, { status: 204 });
};
