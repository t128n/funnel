import { forge } from "#/lib/server/forge/providers.server";

/**
 * Map a failed installation lookup to a client response.
 * Unknown repo / App not installed -> enriched 404, else forward status.
 * The 404 link resolves against the configured web host, so enterprise
 * instances point at `https://acme.ghe.com/<owner>/<repo>` rather than
 * github.com.
 */
export async function installationErrorResponse(
  owner: string,
  repo: string,
  e: unknown,
): Promise<Response> {
  const s = (e as { status?: unknown }).status;
  const status = typeof s === "number" ? s : 500;
  if (status === 404) {
    return Response.json(
      {
        message: "Not synced, open on GitHub",
        html_url: await forge.webUrl(`${owner}/${repo}`),
      },
      { status: 404 },
    );
  }
  return Response.json({ message: "Upstream error" }, { status });
}
