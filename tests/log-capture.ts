import {
  resetLogForTests,
  setLogDestinationForTests,
} from "#lib/server/log";

export type LogEntry = Record<string, unknown>;

export interface LogCapture {
  entries: LogEntry[];
  /** The last record for a component and message, if any. */
  find(component: string, msg: string): LogEntry | undefined;
  /** Restore the silent production logger; call from `afterEach`. */
  reset(): void;
}

/**
 * Capture structured log records for one test.
 *
 * The shared logger resolves its root on every call, so module-level children
 * installed before this helper still write here. Tests must call `reset()` in
 * `afterEach` so the rest of the suite stays quiet.
 */
export function captureLog(): LogCapture {
  const entries: LogEntry[] = [];
  setLogDestinationForTests({
    write(line: string) {
      entries.push(JSON.parse(line) as LogEntry);
    },
  });

  return {
    entries,
    find(component, msg) {
      return entries.find(
        (entry) => entry.component === component && entry.msg === msg,
      );
    },
    reset() {
      resetLogForTests();
    },
  };
}
