import { afterEach, describe, expect, test } from "bun:test";
import pino from "pino";
import {
  createLogger,
  errorFields,
  loggerOptions,
  resetLogForTests,
  setLogDestinationForTests,
} from "./log";

/** A synchronous pino sink that records each parsed JSON log line. */
function capture() {
  const entries: Record<string, unknown>[] = [];
  const stream = {
    write(line: string) {
      entries.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  return { entries, stream };
}

describe("loggerOptions", () => {
  test("honours the level and enables the pretty transport in dev", () => {
    const options = loggerOptions("debug", true);
    expect(options.level).toBe("debug");
    expect(options.transport).toEqual(
      expect.objectContaining({ target: "pino-pretty" }),
    );
  });

  test("emits plain JSON (no transport) outside dev", () => {
    const options = loggerOptions("info", false);
    expect(options.level).toBe("info");
    expect(options.transport).toBeUndefined();
    expect(options.redact).toEqual(
      expect.objectContaining({ paths: expect.arrayContaining(["token"]) }),
    );
  });

  test("writes structured JSON with child bindings and redacts secrets", () => {
    const { entries, stream } = capture();
    const log = pino(
      loggerOptions("info", false),
      stream as unknown as pino.DestinationStream,
    );

    log.child({ component: "labels" }).info(
      { repo: "orgA/core", accessToken: "ghs_secret" },
      "reconciled",
    );

    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("reconciled");
    expect(entry.app).toBe("funnel");
    expect(entry.component).toBe("labels");
    expect(entry.repo).toBe("orgA/core");
    // Secrets are censored before they reach the sink.
    expect(entry.accessToken).toBe("[redacted]");
    expect(JSON.stringify(entry)).not.toContain("ghs_secret");
  });
});

describe("test seam", () => {
  afterEach(() => {
    resetLogForTests();
  });

  test("a child created before the swap writes to the test sink", () => {
    const { entries, stream } = capture();
    // Module-level callers create their child at import time.
    const log = createLogger({ component: "sync" });

    setLogDestinationForTests(stream as unknown as pino.DestinationStream);
    log.info({ repos: 2, durationMs: 4 }, "cycle finished");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "info",
      component: "sync",
      msg: "cycle finished",
      repos: 2,
      durationMs: 4,
    });
  });

  test("errorFields keeps the error and lifts an upstream status", () => {
    const error = Object.assign(new Error("Not Found"), { status: 404 });

    expect(errorFields(error)).toEqual({ err: error, status: 404 });
    expect(errorFields("plain failure")).toEqual({ err: "plain failure" });
  });
});
