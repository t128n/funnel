/**
 * Structured logging (SPEC §10.2).
 *
 * One process-wide {@link logger} produces JSON on stdout, with the verbosity
 * driven by the validated `LOG_LEVEL` env var (`src/env.ts`). In development
 * the output is piped through `pino-pretty` for human-readable lines; because
 * `dev` is SvelteKit's compile-time flag, that branch (and the `pino-pretty`
 * devDependency it references) is tree-shaken out of production builds.
 *
 * Background cycles should bind a stable context once and log structured
 * fields — not interpolated strings — so logs stay machine-parseable:
 *
 * ```ts
 * const log = createLogger({ component: "sync", cycle });
 * log.info({ repos: repos.length }, "sync cycle started");
 * // ...do work...
 * log.info({ changed, failed, durationMs }, "sync cycle finished");
 * ```
 *
 * Errors belong under the `err` key (pino's serializer expands them) or as a
 * stringified field when a serialized `Error` would lose context (e.g. an
 * Octokit status code).
 */
import { dev } from "$app/env";
import { LOG_LEVEL } from "$app/env/private";
import pino, { type Logger, type LoggerOptions } from "pino";

export type { Logger };

/**
 * Fields that must never reach a log sink. GitHub tokens/refresh tokens, the
 * OAuth client secret, and the App's PEM key would otherwise leak verbatim if
 * a caller logged a credential-bearing object.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "token",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "privateKey",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
];

/**
 * Build the pino options for a level and environment. Pure so the singleton
 * below and the unit tests share one definition.
 */
export function loggerOptions(level: string, isDev: boolean): LoggerOptions {
  const options: LoggerOptions = {
    level,
    base: { app: "funnel" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  };

  if (isDev) {
    // Only referenced in development, so `pino-pretty` never has to be present
    // in a production install.
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname,app",
      },
    };
  }

  return options;
}

/** Process-wide root logger: JSON in production, pretty in development. */
export const logger: Logger = pino(loggerOptions(LOG_LEVEL, dev));

/** Child logger carrying stable bindings (e.g. `{ component: "labels" }`). */
export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return logger.child(bindings);
}
