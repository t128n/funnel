import { describe, expect, test } from "bun:test";
import {
  buildManifest,
  buildManifestFormHtml,
  manifestFormAction,
  MANIFEST_EVENTS,
  MANIFEST_PERMISSIONS,
  webhookUrl,
} from "./manifest";

const URLS = {
  baseUrl: "https://funnel.example.com",
  callbackUrl: "https://funnel.example.com/api/auth/callback/github",
  redirectUrl: "https://funnel.example.com/onboarding/callback",
  setupUrl: "https://funnel.example.com/onboarding/installed",
};

describe("buildManifest", () => {
  test("wires the instance URLs and minimal permissions", () => {
    const manifest = buildManifest("funnel-acme", URLS);
    expect(manifest).toEqual({
      name: "funnel-acme",
      url: "https://funnel.example.com",
      redirect_url: "https://funnel.example.com/onboarding/callback",
      callback_urls: ["https://funnel.example.com/api/auth/callback/github"],
      setup_url: "https://funnel.example.com/onboarding/installed",
      public: false,
      default_permissions: { ...MANIFEST_PERMISSIONS },
      default_events: [...MANIFEST_EVENTS],
      hook_attributes: {
        url: "https://funnel.example.com/api/github/webhooks",
        active: true,
      },
    });
  });

  test("subscribes to the events the receiver handles", () => {
    expect([...MANIFEST_EVENTS]).toEqual([
      "issues",
      "issue_comment",
      "pull_request",
      "pull_request_review",
      "check_run",
      "check_suite",
    ]);
    // Label changes arrive as `issues` actions, not a separate event.
    expect(MANIFEST_EVENTS).not.toContain("label");
  });

  test("derives the webhook URL from the captured origin", () => {
    expect(webhookUrl("https://funnel.example.com")).toBe(
      "https://funnel.example.com/api/github/webhooks",
    );
    expect(webhookUrl("https://funnel.example.com/")).toBe(
      "https://funnel.example.com/api/github/webhooks",
    );
  });

  test("requests issues:write and read-only development context", () => {
    expect(MANIFEST_PERMISSIONS.issues).toBe("write");
    expect(MANIFEST_PERMISSIONS.metadata).toBe("read");
    expect(MANIFEST_PERMISSIONS.pull_requests).toBe("read");
    expect(MANIFEST_PERMISSIONS.checks).toBe("read");
    expect(MANIFEST_PERMISSIONS).not.toHaveProperty("administration");
    // Development context is read-only: Funnel never writes a PR or check.
    expect(MANIFEST_PERMISSIONS).not.toHaveProperty("actions");
    expect(MANIFEST_PERMISSIONS).not.toHaveProperty("workflows");
  });
});

describe("manifestFormAction", () => {
  test("personal accounts post to /settings/apps/new", () => {
    expect(manifestFormAction("https://github.com", { type: "user" })).toBe(
      "https://github.com/settings/apps/new",
    );
  });

  test("organizations post to the org path, encoding the slug", () => {
    expect(
      manifestFormAction("https://github.com/", {
        type: "organization",
        org: "my org",
      }),
    ).toBe("https://github.com/organizations/my%20org/settings/apps/new");
  });

  test("enterprise hosts are honoured", () => {
    expect(manifestFormAction("https://acme.ghe.com", { type: "user" })).toBe(
      "https://acme.ghe.com/settings/apps/new",
    );
  });
});

describe("buildManifestFormHtml", () => {
  test("escapes attribute-hostile manifest content", () => {
    const manifest = buildManifest('evil "><script>&x', URLS);
    const html = buildManifestFormHtml(
      "https://github.com/settings/apps/new",
      manifest,
      "state-123",
    );
    expect(html).not.toContain('"><script>');
    expect(html).toContain("&quot;");
    expect(html).toContain("state-123");
    expect(html).toContain('name="manifest"');
  });
});
