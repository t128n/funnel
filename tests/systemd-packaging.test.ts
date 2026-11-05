import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const systemdDir = join(root, "packaging", "systemd");
const unitPath = join(systemdDir, "funnel.service");
const envPath = join(systemdDir, "funnel.env.example");
const installPath = join(systemdDir, "install.sh");
const guidePath = join(root, "docs", "how-to", "deploy", "linux-systemd.md");

describe("systemd unit template", () => {
  test("matches the installer's system-mode defaults", () => {
    const unit = readFileSync(unitPath, "utf8");

    const directives = [
      "[Unit]",
      "Description=Funnel",
      "After=network-online.target",
      "Wants=network-online.target",
      "[Service]",
      "Type=simple",
      "User=funnel",
      "Group=funnel",
      "WorkingDirectory=/var/lib/funnel",
      "EnvironmentFile=-/etc/funnel/funnel.env",
      "Environment=FUNNEL_ENV_FILE=/etc/funnel/funnel.env",
      "Environment=FUNNEL_DATA_DIR=/var/lib/funnel",
      "ExecStart=/usr/local/bin/funnel",
      "Restart=on-failure",
      "RestartSec=5",
      "TimeoutStopSec=35",
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "ProtectSystem=strict",
      "ProtectHome=true",
      "ReadWritePaths=/var/lib/funnel /var/log/funnel",
      "[Install]",
      "WantedBy=multi-user.target",
    ];

    for (const directive of directives) {
      expect(unit).toContain(directive);
    }

    // The static template logs to the journal and avoids append: directives
    // that only newer systemd releases understand.
    expect(unit).not.toContain("StandardOutput=append:");
    expect(unit).not.toContain("StandardError=append:");
    expect(unit.trimEnd().endsWith("WantedBy=multi-user.target")).toBe(true);
  });
});

describe("systemd environment template", () => {
  test("contains the deployment keys and secret guidance", () => {
    const env = readFileSync(envPath, "utf8");

    expect(env).toContain("FUNNEL_URL=");
    expect(env).toContain("FUNNEL_SECRET=");
    expect(env).toContain("FUNNEL_DATA_DIR=/var/lib/funnel");
    expect(env).toContain("FUNNEL_ENV_FILE=/etc/funnel/funnel.env");
    expect(env).toContain("openssl rand -base64 32");
    expect(env).toContain("at least 32 characters");
  });
});

describe("systemd install helper", () => {
  test("runs the installer instead of reimplementing it", () => {
    const script = readFileSync(installPath, "utf8").replace(/\r\n/g, "\n");

    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain("set -eu");
    expect(script).toContain("id -u");
    expect(script).toContain("setup");
    expect(script).toContain("--mode system");
    expect(script).toContain("--yes");
    expect(script).toContain("--config-file /etc/funnel/funnel.env");
    expect(script).toContain("--data-dir /var/lib/funnel");
    expect(script).toContain("--log-dir /var/log/funnel");
    expect(script).toContain('--port "${PORT:-3000}"');
    expect(script).not.toContain("useradd");
    expect(script).not.toContain("systemctl");
  });

  test.skipIf(process.platform === "win32")(
    "is executable and passes a shell syntax check",
    () => {
      expect(statSync(installPath).mode & 0o111).not.toBe(0);

      // Parse a normalised copy: a CRLF working tree (a local Windows clone
      // without .gitattributes applied) must not fail a POSIX syntax check.
      const dir = mkdtempSync(join(tmpdir(), "funnel-systemd-"));
      const scriptPath = join(dir, "install.sh");
      try {
        writeFileSync(
          scriptPath,
          readFileSync(installPath, "utf8").replace(/\r\n/g, "\n"),
        );
        const check = Bun.spawnSync({
          cmd: ["sh", "-n", scriptPath],
          stdout: "pipe",
          stderr: "pipe",
        });
        expect(check.exitCode).toBe(0);
        expect(check.stderr.toString()).toBe("");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

describe("Linux systemd guide", () => {
  test("covers installation, probes, and operations", () => {
    const guide = readFileSync(guidePath, "utf8");

    for (const term of [
      "funnel setup",
      "install.sh",
      "/healthz",
      "/readyz",
      "systemctl",
      "journalctl",
      "funnel upgrade --binary",
      "funnel uninstall --purge",
      "ReadWritePaths",
      "ADDRESS_HEADER",
      "XFF_DEPTH",
    ]) {
      expect(guide).toContain(term);
    }
  });

  test("is linked from the installer docs, documentation index, and README", () => {
    expect(readFileSync(join(root, "docs/how-to/deploy/install.md"), "utf8")).toContain(
      "linux-systemd.md",
    );
    expect(readFileSync(join(root, "docs/README.md"), "utf8")).toContain(
      "how-to/deploy/linux-systemd.md",
    );
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
      "docs/how-to/deploy/linux-systemd.md",
    );
  });
});
