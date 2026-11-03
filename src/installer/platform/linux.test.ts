import { describe, expect, test } from "bun:test";
import type { InstallConfig } from "../types";
import {
  SYSTEMD_APPEND_MIN_VERSION,
  createLinuxServiceManager,
  parseSystemdVersion,
  renderSystemdUnit,
  systemdQuote,
  systemdUnitPath,
} from "./linux";

function config(overrides: Partial<InstallConfig> = {}): InstallConfig {
  return {
    installDir: "/usr/local/bin",
    configFile: "/etc/funnel/funnel.env",
    dataDir: "/var/lib/funnel",
    logDir: "/var/log/funnel",
    manifestPath: "/etc/funnel/install.json",
    version: "0.1.0",
    platform: "linux",
    mode: "system",
    port: 3000,
    host: "0.0.0.0",
    url: "",
    logLevel: "info",
    logMode: "journald",
    force: false,
    dryRun: false,
    noElevate: false,
    serviceName: "funnel",
    launchdLabel: "io.github.t128n.funnel",
    ...overrides,
  };
}

describe("renderSystemdUnit", () => {
  test("renders the system unit with a dedicated user and hardening", () => {
    const unit = renderSystemdUnit(config());

    expect(unit).toContain("Description=Funnel");
    expect(unit).toContain("After=network-online.target");
    expect(unit).toContain("Wants=network-online.target");
    expect(unit).toContain("User=funnel");
    expect(unit).toContain("Group=funnel");
    expect(unit).toContain("WorkingDirectory=/var/lib/funnel");
    expect(unit).toContain(
      "Environment=FUNNEL_ENV_FILE=/etc/funnel/funnel.env",
    );
    expect(unit).toContain("Environment=FUNNEL_DATA_DIR=/var/lib/funnel");
    expect(unit).toContain("ExecStart=/usr/local/bin/funnel");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("RestartSec=5");
    expect(unit).toContain("TimeoutStopSec=35");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("PrivateTmp=true");
    expect(unit).toContain("ProtectSystem=strict");
    expect(unit).toContain("ProtectHome=true");
    expect(unit).toContain("ReadWritePaths=/var/lib/funnel");
    expect(unit).toContain("WantedBy=multi-user.target");
    expect(unit).not.toContain("StandardOutput=");
    expect(unit).not.toContain("StandardError=");
    expect(unit.endsWith("\n")).toBe(true);
  });

  test("renders the user unit without system-only directives", () => {
    const unit = renderSystemdUnit(config({ mode: "user" }));

    expect(unit).not.toContain("User=funnel");
    expect(unit).not.toContain("Group=funnel");
    expect(unit).not.toContain("ProtectSystem=");
    expect(unit).not.toContain("ProtectHome=");
    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("PrivateTmp=true");
    expect(unit).toContain("WantedBy=default.target");
  });

  test("substitutes custom install, config, data, and log paths", () => {
    const unit = renderSystemdUnit(
      config({
        installDir: "/opt/funnel/bin",
        configFile: "/srv/funnel/config/funnel.env",
        dataDir: "/srv/funnel/data",
        logDir: "/srv/funnel/logs",
      }),
    );

    expect(unit).toContain("ExecStart=/opt/funnel/bin/funnel");
    expect(unit).toContain(
      "Environment=FUNNEL_ENV_FILE=/srv/funnel/config/funnel.env",
    );
    expect(unit).toContain("WorkingDirectory=/srv/funnel/data");
    expect(unit).toContain("ReadWritePaths=/srv/funnel/data");
  });

  test("quotes paths containing spaces", () => {
    const unit = renderSystemdUnit(
      config({
        installDir: "/opt/my funnel/bin",
        configFile: "/etc/my funnel/funnel.env",
        dataDir: "/srv/my funnel/data",
        logDir: "/var/log/my funnel",
      }),
    );

    expect(unit).toContain('ExecStart="/opt/my funnel/bin/funnel"');
    expect(unit).toContain(
      'Environment="FUNNEL_ENV_FILE=/etc/my funnel/funnel.env"',
    );
    expect(unit).toContain('WorkingDirectory="/srv/my funnel/data"');
    expect(unit).toContain('ReadWritePaths="/srv/my funnel/data"');
  });

  test("escapes double quotes, backslashes, and percent signs", () => {
    const unit = renderSystemdUnit(
      config({ dataDir: '/srv/100%/"quoted"\\data' }),
    );

    expect(unit).toContain(
      'WorkingDirectory="/srv/100%%/\\"quoted\\"\\\\data"',
    );
  });

  test("writes append: log targets for file logging", () => {
    const unit = renderSystemdUnit(
      config({ logMode: "file", logDir: "/var/log/funnel" }),
    );

    expect(unit).toContain(
      "StandardOutput=append:/var/log/funnel/funnel.log",
    );
    expect(unit).toContain(
      "StandardError=append:/var/log/funnel/funnel-error.log",
    );
    // The log directory must stay writable under ProtectSystem=strict.
    expect(unit).toContain(
      "ReadWritePaths=/var/lib/funnel /var/log/funnel",
    );
  });

  test("quotes append: log targets containing spaces", () => {
    const unit = renderSystemdUnit(
      config({ logMode: "file", logDir: "/var/log/my funnel" }),
    );

    expect(unit).toContain(
      'StandardOutput="append:/var/log/my funnel/funnel.log"',
    );
    expect(unit).toContain(
      'ReadWritePaths=/var/lib/funnel "/var/log/my funnel"',
    );
  });

  test("falls back to journald when append: is unsupported", () => {
    const fileConfig = config({ logMode: "file" });
    const unit = renderSystemdUnit(fileConfig, fileConfig.mode, {
      append: false,
    });

    expect(unit).not.toContain("StandardOutput=");
    expect(unit).not.toContain("StandardError=");
    expect(unit).toContain("ReadWritePaths=/var/lib/funnel");
  });

  test("throws for portable mode", () => {
    expect(() => renderSystemdUnit(config({ mode: "portable" }))).toThrow(
      /Portable mode does not use systemd/,
    );
  });
});

describe("systemdUnitPath", () => {
  test("uses the system unit directory for system mode", () => {
    expect(systemdUnitPath(config())).toBe(
      "/etc/systemd/system/funnel.service",
    );
  });

  test("uses the user unit directory for user mode", () => {
    expect(systemdUnitPath(config({ mode: "user" }), "/home/tester")).toBe(
      "/home/tester/.config/systemd/user/funnel.service",
    );
  });

  test("honors a custom service name", () => {
    expect(
      systemdUnitPath(config({ serviceName: "funnel-test" }), "/home/tester"),
    ).toBe("/etc/systemd/system/funnel-test.service");
  });

  test("throws for portable mode", () => {
    expect(() => systemdUnitPath(config({ mode: "portable" }))).toThrow(
      /Portable mode does not use systemd/,
    );
  });
});

describe("createLinuxServiceManager", () => {
  test("throws for portable mode", () => {
    expect(() =>
      createLinuxServiceManager(config({ mode: "portable" })),
    ).toThrow(/Portable mode does not use systemd/);
  });

  test("returns a systemd manager for system and user modes", () => {
    expect(createLinuxServiceManager(config()).kind).toBe("systemd");
    expect(createLinuxServiceManager(config({ mode: "user" })).kind).toBe(
      "systemd",
    );
  });
});

describe("parseSystemdVersion", () => {
  test("reads the version from systemctl output", () => {
    expect(parseSystemdVersion("systemd 252 (252.5-2ubuntu3)")).toBe(252);
    expect(parseSystemdVersion("systemd 240")).toBe(240);
  });

  test("returns undefined when the version is missing", () => {
    expect(parseSystemdVersion("not systemd")).toBeUndefined();
  });

  test("knows the append: minimum version", () => {
    expect(SYSTEMD_APPEND_MIN_VERSION).toBe(240);
  });
});

describe("systemdQuote", () => {
  test("leaves simple values untouched", () => {
    expect(systemdQuote("/var/lib/funnel")).toBe("/var/lib/funnel");
  });

  test("quotes values with spaces", () => {
    expect(systemdQuote("/var/lib/my funnel")).toBe('"/var/lib/my funnel"');
  });

  test("escapes embedded double quotes", () => {
    expect(systemdQuote('/var/lib/"funnel"')).toBe(
      '"/var/lib/\\"funnel\\""',
    );
  });
});
