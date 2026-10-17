/**
 * Browser-side Better Auth client.
 *
 * The server renders the current session into the layout data, so components
 * generally read the user from `data` rather than this client. The client is
 * only needed for the two interactive flows: starting the GitHub OAuth sign-in
 * and signing out.
 */
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient();

/** Begin the GitHub OAuth flow, returning to `callbackURL` afterwards. */
export async function signInWithGitHub(callbackURL = "/inbox"): Promise<void> {
  await authClient.signIn.social({ provider: "github", callbackURL });
}

/** End the current session. */
export async function signOut(): Promise<void> {
  await authClient.signOut();
}
