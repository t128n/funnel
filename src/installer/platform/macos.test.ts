import { describe, expect, test } from "bun:test";
import {
  createMacosServiceManager,
  escapePlistXml,
  launchdPlistPath,
  renderLaunchdPlist,
} from "./macos";
import { LAUNCHD_LABEL, type InstallConfig } from "../types";

function makeConfig(overrides: Partial<InstallConfig> = {}): InstallConfig {
  return {
    version: "0.1.0",
    platform: "macos",
    mode: "system",
    installDir: "/usr/local/bin",
    configFile: "/Library/Application Support/Funnel/funnel.env",
    dataDir: "/Library/Application Support/Funnel/data",
    logDir: "/Library/Logs/Funnel",
    manifestPath: "/Library/Application Support/Funnel/install.json",
    port: 3000,
    host: "0.0.0.0",
    url: "",
    logLevel: "info",
    logMode: "file",
    force: false,
    dryRun: false,
    noElevate: false,
    serviceName: "funnel",
    launchdLabel: LAUNCHD_LABEL,
    ...overrides,
  };
}

describe("launchdPlistPath", () => {
  test("system mode uses the LaunchDaemons directory", () => {
    expect(launchdPlistPath(makeConfig(), "system")).toBe(
      "/Library/LaunchDaemons/io.github.t128n.funnel.plist",
    );
  });

  test("user mode uses the LaunchAgents directory", () => {
    expect(launchdPlistPath(makeConfig(), "user", "/Users/Test User")).toBe(
      "/Users/Test User/Library/LaunchAgents/io.github.t128n.funnel.plist",
    );
  });

  test("honours a custom label", () => {
    const config = makeConfig({ launchdLabel: "dev.example.funnel" });
    expect(launchdPlistPath(config, "system")).toBe(
      "/Library/LaunchDaemons/dev.example.funnel.plist",
    );
  });
});

describe("escapePlistXml", () => {
  test("escapes every XML special character", () => {
    expect(escapePlistXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});

describe("renderLaunchdPlist", () => {
  test("renders a system LaunchDaemon with the service account", () => {
    const plist = renderLaunchdPlist(makeConfig(), "system");

    expect(plist).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(plist).toContain("<plist version=\"1.0\">");
    expect(plist).toContain(
      "  <key>Label</key>\n  <string>io.github.t128n.funnel</string>",
    );
    expect(plist).toContain(
      "  <key>ProgramArguments</key>\n  <array>\n    <string>/usr/local/bin/funnel</string>\n  </array>",
    );
    expect(plist).toContain(
      "  <key>WorkingDirectory</key>\n  <string>/Library/Application Support/Funnel/data</string>",
    );
    expect(plist).toContain(
      "  <key>UserName</key>\n  <string>_funnel</string>",
    );
    expect(plist).toContain(
      "  <key>GroupName</key>\n  <string>_funnel</string>",
    );
    expect(plist).toContain(
      "    <key>FUNNEL_ENV_FILE</key>\n    <string>/Library/Application Support/Funnel/funnel.env</string>",
    );
    expect(plist).toContain(
      "    <key>FUNNEL_DATA_DIR</key>\n    <string>/Library/Application Support/Funnel/data</string>",
    );
    expect(plist).toContain("  <key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain(
      "  <key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key>\n    <false/>\n  </dict>",
    );
    expect(plist).toContain(
      "  <key>ProcessType</key>\n  <string>Background</string>",
    );
    expect(plist).toContain(
      "  <key>StandardOutPath</key>\n  <string>/Library/Logs/Funnel/funnel.log</string>",
    );
    expect(plist).toContain(
      "  <key>StandardErrorPath</key>\n  <string>/Library/Logs/Funnel/funnel-error.log</string>",
    );
  });

  test("renders a user LaunchAgent without an explicit account", () => {
    const config = makeConfig({
      mode: "user",
      installDir: "/Users/Test User/.local/bin",
      configFile: "/Users/Test User/Library/Application Support/Funnel/funnel.env",
      dataDir: "/Users/Test User/Library/Application Support/Funnel/data",
      logDir: "/Users/Test User/Library/Logs/Funnel",
    });

    const plist = renderLaunchdPlist(config, "user");

    expect(plist).not.toContain("UserName");
    expect(plist).not.toContain("GroupName");
    expect(plist).toContain(
      "<string>/Users/Test User/.local/bin/funnel</string>",
    );
    expect(plist).toContain(
      "<string>/Users/Test User/Library/Application Support/Funnel/funnel.env</string>",
    );
    expect(plist).toContain(
      "<string>/Users/Test User/Library/Logs/Funnel/funnel.log</string>",
    );
    expect(plist).toContain(
      "<string>/Users/Test User/Library/Logs/Funnel/funnel-error.log</string>",
    );
  });

  test("keeps custom paths with spaces intact", () => {
    const config = makeConfig({
      installDir: "/opt/Funnel Products/bin",
      configFile: "/etc/Funnel Config/funnel.env",
      dataDir: "/var/lib/Funnel Data",
      logDir: "/var/log/Funnel Logs",
      launchdLabel: "dev.example.funnel",
    });

    const plist = renderLaunchdPlist(config, "system");

    expect(plist).toContain(
      "  <key>Label</key>\n  <string>dev.example.funnel</string>",
    );
    expect(plist).toContain(
      "<string>/opt/Funnel Products/bin/funnel</string>",
    );
    expect(plist).toContain("<string>/etc/Funnel Config/funnel.env</string>");
    expect(plist).toContain("<string>/var/lib/Funnel Data</string>");
    expect(plist).toContain("<string>/var/log/Funnel Logs/funnel.log</string>");
  });

  test("escapes XML in every interpolated value", () => {
    const config = makeConfig({
      launchdLabel: "dev.example.funnel&co",
      installDir: '/opt/A & B "<bin>"',
      configFile: "/etc/a<b>&c/funnel.env",
      dataDir: "/var/lib/<data>&more",
      logDir: "/var/log/'logs'",
    });

    const plist = renderLaunchdPlist(config, "system");

    expect(plist).toContain(
      "<string>dev.example.funnel&amp;co</string>",
    );
    expect(plist).toContain(
      "<string>/opt/A &amp; B &quot;&lt;bin&gt;&quot;/funnel</string>",
    );
    expect(plist).toContain(
      "<string>/etc/a&lt;b&gt;&amp;c/funnel.env</string>",
    );
    expect(plist).toContain("<string>/var/lib/&lt;data&gt;&amp;more</string>");
    expect(plist).toContain(
      "<string>/var/log/&apos;logs&apos;/funnel-error.log</string>",
    );
    expect(plist).not.toContain("<data>");
  });

  test("rejects non-macOS configs", () => {
    expect(() =>
      renderLaunchdPlist(makeConfig({ platform: "linux" }), "system"),
    ).toThrow(/macOS/);
  });
});

describe("createMacosServiceManager", () => {
  test("rejects portable mode", () => {
    expect(() =>
      createMacosServiceManager(makeConfig({ mode: "portable" })),
    ).toThrow(/Portable mode does not use launchd/);
  });

  test("returns a launchd manager for system and user modes", () => {
    expect(createMacosServiceManager(makeConfig()).kind).toBe("launchd");
    expect(
      createMacosServiceManager(makeConfig({ mode: "user" })).kind,
    ).toBe("launchd");
  });
});
