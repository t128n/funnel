import { describe, expect, test } from "bun:test";
import { GET } from "#/routes/api/[...rest]/+server";

/**
 * The catch-all under `/api` guarantees a JSON 404 for unknown endpoints, so an
 * API client that sends `Accept: text/html` never receives the HTML error page.
 */
describe("api catch-all", () => {
  test("answers unknown paths with a JSON 404", async () => {
    const response = await GET({} as never);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ message: "Not found" });
  });
});
