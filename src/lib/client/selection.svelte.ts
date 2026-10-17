/**
 * Detail-canvas selection is URL-driven so the open pane is always shareable
 * and survives reloads. Issues live in the `?issue=<owner>/<repo>/<n>` query
 * parameter and staged intake submissions in `?submission=<id>`, alongside (and
 * independent of) the filter parameters. At most one is ever set.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";

export type Selection =
  | { kind: "issue"; repo: string; number: number }
  | { kind: "submission"; id: string };

/** The selected issue, or `null` when a submission (or nothing) is selected. */
export function selectedIssue(
  selection: Selection | null,
): { repo: string; number: number } | null {
  return selection?.kind === "issue" ? selection : null;
}

/** Parse the current detail selection, or `null` when none/invalid. */
export function parseSelection(): Selection | null {
  const raw = page.url.searchParams.get("issue");
  if (raw) {
    const parts = raw.split("/");
    if (parts.length === 3) {
      const number = Number(parts[2]);
      if (Number.isInteger(number) && number > 0) {
        return { kind: "issue", repo: `${parts[0]}/${parts[1]}`, number };
      }
    }
  }

  const submission = page.url.searchParams.get("submission");
  if (submission) return { kind: "submission", id: submission };

  return null;
}

/** Apply a selection (or clear it) while preserving every other query param. */
function update(value: Selection | null): void {
  const url = new URL(page.url.href);
  url.searchParams.delete("issue");
  url.searchParams.delete("submission");
  if (value?.kind === "issue") {
    url.searchParams.set("issue", `${value.repo}/${value.number}`);
  } else if (value?.kind === "submission") {
    url.searchParams.set("submission", value.id);
  }
  void goto(url, { reset: false });
}

/** Open the detail canvas for issue `repo#number`. */
export function selectIssue(repo: string, number: number): void {
  update({ kind: "issue", repo, number });
}

/** Open the detail canvas for staged intake submission `id`. */
export function selectSubmission(id: string): void {
  update({ kind: "submission", id });
}

/** Dismiss the detail canvas. */
export function clearSelection(): void {
  update(null);
}
