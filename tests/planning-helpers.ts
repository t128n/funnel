/**
 * Seed helpers for the planning tests.
 *
 * The planner reads the disposable mirror (`mirror_*`) joined to the durable
 * `state_plan_item` table. Tests seed the mirror directly instead of running a
 * sync, so these helpers keep repo/user ids deterministic and wipe both the
 * mirror and the durable plan rows between cases.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "#lib/server/db/index";
import { authUser, stateIssueEvent, statePlanItem } from "#lib/server/db/schema";
import {
  replaceRepoAssignees,
  replaceRepoMilestones,
  upsertIssue,
  upsertRepo,
  upsertUser,
  type MilestoneRecord,
  type UserRecord,
} from "#lib/server/sync/mirror";
import { clearMirror } from "#tests/mirror-helpers";

/** A `github.com` person; `externalId` defaults to the login for readability. */
export function planningUser(login: string, externalId = login): UserRecord {
  return {
    id: 0,
    externalId,
    forge: "github",
    instance: "github.com",
    login,
    avatarUrl: `https://avatars/${login}.png`,
    url: "",
  };
}

/** Create one mirrored repo and return its internal id. */
export function seedPlanningRepo(slug: string, externalId = slug): number {
  const [org, name] = slug.split("/");
  return upsertRepo({
    externalId,
    forge: "github",
    instance: "github.com",
    org,
    name,
    url: `https://github.com/${slug}`,
    archived: false,
  }).id;
}

export interface PlanningIssueSeed {
  repoId: number;
  number: number;
  title?: string;
  state?: "open" | "closed";
  stateReason?: string | null;
  size?: string | null;
  status?: string | null;
  priority?: "P1" | "P2" | "P3" | null;
  assignees?: UserRecord[];
  milestoneNumber?: number | null;
  updatedAt?: number;
}

/** Insert or replace one mirrored issue with its cached triage metadata. */
export function seedPlanningIssue(seed: PlanningIssueSeed): void {
  const state = seed.state ?? "open";
  upsertIssue(
    {
      externalId: `${seed.repoId}/${seed.number}`,
      repoId: seed.repoId,
      number: seed.number,
      kind: "issue",
      title: seed.title ?? `Issue ${seed.number}`,
      body: "",
      state,
      stateReason: seed.stateReason ?? null,
      author: null,
      milestoneNumber: seed.milestoneNumber ?? null,
      url: "",
      createdAt: 1,
      updatedAt: seed.updatedAt ?? seed.number,
      closedAt: state === "closed" ? 1 : null,
      labels: [],
      assignees: seed.assignees ?? [],
      comments: [],
    },
    {
      status: seed.status ?? null,
      impact: null,
      urgency: null,
      priority: seed.priority ?? null,
      size: seed.size ?? null,
      blocked: false,
      labelConflict: false,
    },
  );
}

/** Replace a repo's assignable-user set (the roster candidate source). */
export function seedRepoAssignees(
  repoId: number,
  users: readonly UserRecord[],
): void {
  replaceRepoAssignees(repoId, users);
}

/** Replace a repo's milestones. */
export function seedMilestones(
  repoId: number,
  milestones: readonly MilestoneRecord[],
): void {
  replaceRepoMilestones(repoId, milestones);
}

/** One milestone with sensible defaults for planning tests. */
export function planningMilestone(
  number: number,
  input: Partial<MilestoneRecord> = {},
): MilestoneRecord {
  return {
    number,
    externalId: `milestone-${number}`,
    title: `Milestone ${number}`,
    description: "",
    state: "open",
    dueOn: null,
    openIssues: 0,
    closedIssues: 0,
    creator: null,
    createdAt: 1,
    updatedAt: 1,
    closedAt: null,
    url: "",
    ...input,
  };
}

/** Ensure a user exists in the mirror and return it with its internal id. */
export function ensurePlanningUser(login: string, externalId = login): UserRecord {
  return upsertUser(planningUser(login, externalId));
}

/**
 * Reset both layers: the disposable mirror (ids restart at 1) and the durable
 * plan rows. Durable rows must be deleted explicitly — clearing the mirror is
 * exactly what plan items are designed to survive.
 */
export function resetPlanning(): void {
  db.delete(statePlanItem).run();
  clearMirror();
}

/**
 * Ensure the durable owner of per-viewer `state_*` rows exists. Deleting the
 * row cascades working hours, windows, day blocks and the calendar feed.
 */
export function seedPlanningAuthUser(id: string, role = "read"): void {
  const now = new Date();
  db.insert(authUser)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
}

/** Remove a viewer seeded by {@link seedPlanningAuthUser} (cascades state). */
export function removePlanningAuthUser(id: string): void {
  db.delete(authUser).where(eq(authUser.id, id)).run();
}

export interface PlanningEventSeed {
  org: string;
  name: string;
  issueNumber: number;
  /** `status` | `state` | `blocked`. */
  kind: "status" | "state" | "blocked";
  toValue: string | null;
  /** Unix milliseconds. */
  at: number;
  fromValue?: string | null;
}

/**
 * Append one observed issue event, the input to the actual-time arithmetic.
 * Events are keyed by `org/name` + issue number, independent of the mirror.
 */
export function seedPlanningEvent(seed: PlanningEventSeed): void {
  db.insert(stateIssueEvent)
    .values({
      id: randomUUID(),
      org: seed.org,
      name: seed.name,
      issueNumber: seed.issueNumber,
      kind: seed.kind,
      fromValue: seed.fromValue ?? null,
      toValue: seed.toValue,
      at: seed.at,
      source: "sync",
    })
    .run();
}
