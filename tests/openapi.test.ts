/**
 * Guards `static/openapi.yml` against drifting away from the handlers it
 * documents.
 *
 * The request body schema is the interesting half: it is *published* by the
 * spec but *owned* by the valibot schema `POST /api/intake` validates with.
 * Rather than keeping two copies in sync by hand, this test compares the spec
 * to the JSON Schema `toJsonSchema` derives from `intakeSchema` at test time.
 *
 * Conversion notes:
 * - `ignoreActions: ["trim"]` drops the `v.trim()` transformations, which have
 *   no JSON Schema equivalent; the surrounding `nonEmpty`/`maxLength` checks
 *   still produce the published `minLength`/`maxLength`.
 * - `typeMode: "input"` describes the request side of the pipeline (what a
 *   caller sends) rather than the parsed output.
 * - `$schema` is stripped: it belongs to a standalone JSON Schema document, not
 *   a schema object embedded in OpenAPI.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toJsonSchema } from "@valibot/to-json-schema";
import YAML from "yaml";
import { intakeSchema } from "#/lib/server/intake/schema";

type Node = Record<string, unknown>;

const spec = YAML.parse(
  readFileSync(
    fileURLToPath(new URL("../static/openapi.yml", import.meta.url)),
    "utf8",
  ),
) as Node;

/** Follow a local `#/...` JSON pointer, or return the node unchanged. */
function deref(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const ref = (node as Node).$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  return segments.reduce<unknown>(
    (acc, segment) => (acc as Node | undefined)?.[segment],
    spec,
  );
}

describe("static/openapi.yml", () => {
  test("documents the request schema the intake handler validates", () => {
    const pathItem = (spec.paths as Node)["/api/intake"] as Node;
    const requestBody = deref((pathItem.post as Node).requestBody) as Node;
    const mediaType = (requestBody.content as Node)["application/json"] as Node;
    const schema = deref(mediaType.schema);

    const generated = toJsonSchema(intakeSchema, {
      target: "draft-2020-12",
      typeMode: "input",
      ignoreActions: ["trim"],
    }) as Node;
    delete generated.$schema;

    expect(schema).toEqual(generated);
  });

  test("every local $ref resolves", () => {
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        if (key === "$ref" && typeof value === "string") refs.push(value);
        else walk(value);
      }
    };
    walk(spec);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toStartWith("#/");
      expect(deref({ $ref: ref })).toBeDefined();
    }
  });
});
