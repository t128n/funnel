/**
 * Issue selection is URL-driven so the Inspector Pane is always shareable and
 * survives reloads. The selected issue lives in the `?issue=<owner>/<repo>/<n>`
 * query parameter, alongside (and independent of) the filter parameters.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";

export interface IssueSelection {
  repo: string;
  number: number;
}

/** Parse the current `?issue=` selection, or `null` when none/invalid. */
export function parseSelection(): IssueSelection | null {
  const raw = page.url.searchParams.get("issue");
  if (!raw) return null;
  const parts = raw.split("/");
  if (parts.length !== 3) return null;
  const number = Number(parts[2]);
  if (!Number.isInteger(number) || number <= 0) return null;
  return { repo: `${parts[0]}/${parts[1]}`, number };
}

function update(value: string | null): void {
  const url = new URL(page.url.href);
  if (value) url.searchParams.set("issue", value);
  else url.searchParams.delete("issue");
  void goto(url, { reset: false });
}

/** Open the Inspector Pane for `repo#number`. */
export function selectIssue(repo: string, number: number): void {
  update(`${repo}/${number}`);
}

/** Dismiss the Inspector Pane. */
export function clearIssue(): void {
  update(null);
}
