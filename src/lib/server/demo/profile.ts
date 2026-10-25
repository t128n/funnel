/**
 * Stable identities and content descriptors for demo mode.
 *
 * These values are shared by the seed (`seed.ts`) and the local GitHub
 * emulation (`provider.ts`). They are deliberately plain constants: no
 * database access, no environment reads, no network.
 */

/** A person mirrored from GitHub: the fields Funnel keys people on. */
export type DemoUser = {
  externalId: string;
  login: string;
  name: string;
};

/** The signed-in demo account's local user id. */
export const DEMO_USER_ID = "demo-user";
/** The signed-in demo account's display name. */
export const DEMO_USER_NAME = "Riley Demo";
/** The signed-in demo account's email. */
export const DEMO_USER_EMAIL = "demo@funnel.local";
/** The signed-in demo account's GitHub subject ("external id"). */
export const DEMO_USER_EXTERNAL_ID = "1001";
/** The signed-in demo account's GitHub login. */
export const DEMO_USER_LOGIN = "demo";

/** The forge the mirrored data claims to come from. */
export const DEMO_FORGE = "github";
/** The forge host the mirrored data claims to come from. */
export const DEMO_INSTANCE = "github.com";

/** The repositories the demo seeds, in board order. */
export const DEMO_REPO_SLUGS = ["demo/funnel", "demo/platform"] as const;

/** The demo account plus four teammates who author and own the seeded work. */
export const DEMO_USERS = [
  {
    externalId: DEMO_USER_EXTERNAL_ID,
    login: DEMO_USER_LOGIN,
    name: DEMO_USER_NAME,
  },
  { externalId: "1002", login: "mira", name: "Mira Okafor" },
  { externalId: "1003", login: "jonas", name: "Jonas Weber" },
  { externalId: "1004", login: "priya", name: "Priya Raman" },
  { externalId: "1005", login: "theo", name: "Theo Lindqvist" },
] as const satisfies readonly DemoUser[];

/** Descriptive labels layered on top of the canonical status labels. */
export const DEMO_EXTRA_LABELS = [
  {
    name: "frontend",
    color: "1d76db",
    description: "Browser and UI work",
  },
  {
    name: "backend",
    color: "0e8a16",
    description: "Server and data work",
  },
  {
    name: "docs",
    color: "5319e7",
    description: "Documentation and guides",
  },
  {
    name: "infra",
    color: "d93f0b",
    description: "Build, deploy, and operations",
  },
] as const satisfies readonly {
  name: string;
  color: string;
  description: string;
}[];
