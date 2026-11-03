import * as p from "@clack/prompts";
import type { Option } from "@clack/prompts";
import type { DoctorReport } from "./types";

export class CancelledError extends Error {
  constructor() {
    super("Setup cancelled.");
    this.name = "CancelledError";
  }
}

function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    throw new CancelledError();
  }
  return value as T;
}

export function intro(message: string): void {
  p.intro(message);
}

export function outro(message: string): void {
  p.outro(message);
}

export function note(message: string, title?: string): void {
  if (title) p.note(message, title);
  else p.note(message);
}

export function info(message: string): void {
  p.log.info(message);
}

export function success(message: string): void {
  p.log.success(message);
}

export function warn(message: string): void {
  p.log.warn(message);
}

export function error(message: string): void {
  p.log.error(message);
}

export function step(message: string): void {
  p.log.step(message);
}

export async function askText(options: {
  message: string;
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}): Promise<string> {
  const value = await p.text({
    message: options.message,
    defaultValue: options.defaultValue,
    placeholder: options.placeholder,
    validate: options.validate
      ? (input) => options.validate?.(input ?? "")
      : undefined,
  });
  return unwrap<string>(value);
}

export async function askConfirm(
  message: string,
  initialValue = true,
): Promise<boolean> {
  const value = await p.confirm({ message, initialValue });
  return unwrap<boolean>(value);
}

export async function askPassword(
  message: string,
  validate?: (value: string) => string | undefined,
): Promise<string> {
  const value = await p.password({
    message,
    validate: validate ? (input) => validate(input ?? "") : undefined,
  });
  return unwrap<string>(value);
}

export async function askSelect<T extends string>(options: {
  message: string;
  options: Option<T>[];
  initialValue?: T;
}): Promise<T> {
  const value = await p.select({
    message: options.message,
    options: options.options,
    initialValue: options.initialValue,
  });
  return unwrap<T>(value);
}

export async function withSpinner<T>(
  message: string,
  task: () => Promise<T>,
): Promise<T> {
  const spinner = p.spinner();
  spinner.start(message);
  try {
    const result = await task();
    spinner.stop("Done.");
    return result;
  } catch (err) {
    spinner.stop("Failed.");
    throw err;
  }
}

export function printDoctor(report: DoctorReport): void {
  for (const check of report.checks) {
    const prefix =
      check.state === "ok" ? "ok" : check.state === "warn" ? "warn" : "fail";
    const suffix = check.detail ? ` — ${check.detail}` : "";
    p.log.info(`[${prefix}] ${check.name}${suffix}`);
  }
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
