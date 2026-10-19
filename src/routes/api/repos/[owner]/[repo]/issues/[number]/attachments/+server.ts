import type { RequestHandler } from "./$types";
import { maxUploadBytes, saveAttachment } from "#lib/server/attachments/store";
import { apiSession } from "#lib/server/http/session";
import { publish } from "#lib/server/sync/events";
import { getRepoByOrgName } from "#lib/server/sync/mirror";
import { resolveViewerRef } from "#lib/server/viewer";

/**
 * Upload a file to an issue's dropbox (`multipart/form-data`, `file` field).
 *
 * Stored on disk under `FUNNEL_UPLOAD_DIR`; only metadata lands in the database.
 * Session-gated. The size cap is enforced here before the bytes reach the store,
 * but the deployed `BODY_SIZE_LIMIT` must also allow the request (see README).
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const denied = apiSession(locals);
  if (denied instanceof Response) return denied;

  const number = Number(params.number);
  if (!Number.isInteger(number) || number <= 0) {
    return Response.json({ message: "Invalid issue number" }, { status: 400 });
  }
  if (!getRepoByOrgName(params.owner, params.repo)) {
    return Response.json(
      {
        message: `Repository ${params.owner}/${params.repo} is not mirrored`,
      },
      { status: 404 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { message: "Request body must be multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { message: "A `file` field is required" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return Response.json({ message: "File is empty" }, { status: 400 });
  }
  const limit = maxUploadBytes();
  if (file.size > limit) {
    return Response.json(
      { message: `File exceeds the ${limit} byte limit` },
      { status: 413 },
    );
  }

  const item = await saveAttachment({
    org: params.owner,
    name: params.repo,
    issueNumber: number,
    filename: file.name,
    mimeType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    uploadedBy: await resolveViewerRef(locals),
  });

  publish({
    type: "issues",
    repo: `${params.owner}/${params.repo}`,
    numbers: [number],
  });
  return Response.json(item, { status: 201 });
};
