import { describe, expect, test } from "bun:test";
import { cliArgs } from "./standalone";

describe("cliArgs", () => {
  test("strips the Bun runtime and script entries", () => {
    expect(
      cliArgs(["bun", "/$bunfs/root/funnel", "setup", "--yes"]),
    ).toEqual(["setup", "--yes"]);
    expect(cliArgs(["bun", "/repo/src/standalone-entry.ts", "status"])).toEqual([
      "status",
    ]);
  });

  test("strips only the executable for a normal binary argv", () => {
    expect(cliArgs(["/usr/local/bin/funnel", "logs", "--follow"])).toEqual([
      "logs",
      "--follow",
    ]);
  });
});
