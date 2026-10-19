import { describe, expect, test } from "bun:test";
import {
  buildManifest,
  buildManifestFormHtml,
  manifestFormAction,
  MANIFEST_PERMISSIONS,
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
      default_events: [],
    });
  });

  test("requests issues:write but no broader scopes", () => {
    expect(MANIFEST_PERMISSIONS.issues).toBe("write");
    expect(MANIFEST_PERMISSIONS.metadata).toBe("read");
    expect(MANIFEST_PERMISSIONS).not.toHaveProperty("administration");
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
