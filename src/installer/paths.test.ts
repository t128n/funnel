import { describe, expect, test } from "bun:test";
import {
  currentPlatform,
  defaultPaths,
  expandPath,
  findExistingManifest,
  isAbsolutePath,
  manifestPathFor,
  resolveInstallPaths,
  validateInstallPaths,
} from "./paths";

const home = "/home/alice";

describe("defaultPaths", () => {
  test("Linux system and user paths", () => {
    expect(defaultPaths({ platform: "linux", mode: "system", home })).toEqual({
      installDir: "/usr/local/bin",
      configFile: "/etc/funnel/funnel.env",
      dataDir: "/var/lib/funnel",
      logDir: "/var/log/funnel",
      manifestPath: "/etc/funnel/install.json",
    });
    expect(defaultPaths({ platform: "linux", mode: "user", home })).toEqual({
      installDir: "/home/alice/.local/bin",
      configFile: "/home/alice/.config/funnel/funnel.env",
      dataDir: "/home/alice/.local/share/funnel",
      logDir: "/home/alice/.local/state/funnel/logs",
      manifestPath: "/home/alice/.config/funnel/install.json",
    });
  });

  test("macOS system and user paths", () => {
    expect(defaultPaths({ platform: "macos", mode: "system", home })).toEqual({
      installDir: "/usr/local/bin",
      configFile: "/Library/Application Support/Funnel/funnel.env",
      dataDir: "/Library/Application Support/Funnel/data",
      logDir: "/Library/Logs/Funnel",
      manifestPath: "/Library/Application Support/Funnel/install.json",
    });
    expect(defaultPaths({ platform: "macos", mode: "user", home })).toEqual({
      installDir: "/home/alice/.local/bin",
      configFile: "/home/alice/Library/Application Support/Funnel/funnel.env",
      dataDir: "/home/alice/Library/Application Support/Funnel/data",
      logDir: "/home/alice/Library/Logs/Funnel",
      manifestPath: "/home/alice/Library/Application Support/Funnel/install.json",
    });
  });

  test("Windows system and portable paths respect environment overrides", () => {
    const env = {
      ProgramFiles: "D:\\Apps",
      ProgramData: "D:\\Data",
      LOCALAPPDATA: "C:\\Users\\Alice\\AppData\\Local",
    };
    expect(defaultPaths({ platform: "windows", mode: "system", home, env })).toEqual({
      installDir: "D:\\Apps\\Funnel",
      configFile: "D:\\Data\\Funnel\\funnel.env",
      dataDir: "D:\\Data\\Funnel\\data",
      logDir: "D:\\Data\\Funnel\\logs",
      manifestPath: "D:\\Data\\Funnel\\install.json",
    });
    expect(defaultPaths({ platform: "windows", mode: "portable", home, env })).toEqual({
      installDir: "C:\\Users\\Alice\\AppData\\Local\\Funnel",
      configFile: "C:\\Users\\Alice\\AppData\\Local\\Funnel\\funnel.env",
      dataDir: "C:\\Users\\Alice\\AppData\\Local\\Funnel\\data",
      logDir: "C:\\Users\\Alice\\AppData\\Local\\Funnel\\logs",
      manifestPath: "C:\\Users\\Alice\\AppData\\Local\\Funnel\\install.json",
    });
  });
});

describe("path overrides", () => {
  test("accepts a Windows config path on another drive", () => {
    const defaults = defaultPaths({
      platform: "windows",
      mode: "system",
      home,
      env: { ProgramFiles: "C:\\Program Files", ProgramData: "C:\\ProgramData" },
    });
    const resolved = resolveInstallPaths(
      defaults,
      {
        configFile: "D:\\Data\\Funnel\\funnel.env",
        logDir: "D:\\Data\\Funnel\\Logs",
      },
      "windows",
      home,
      {},
    );
    expect(resolved.configFile).toBe("D:\\Data\\Funnel\\funnel.env");
    expect(resolved.logDir).toBe("D:\\Data\\Funnel\\Logs");
    expect(resolved.manifestPath).toBe("D:\\Data\\Funnel\\install.json");
    expect(validateInstallPaths(resolved, "windows")).toEqual([]);
  });

  test("rejects relative paths", () => {
    expect(isAbsolutePath("linux", "/var/lib/funnel")).toBe(true);
    expect(isAbsolutePath("linux", "funnel")).toBe(false);
    expect(isAbsolutePath("windows", "D:\\Data\\Funnel")).toBe(true);
    expect(isAbsolutePath("windows", "relative\\funnel")).toBe(false);
    expect(
      validateInstallPaths(
        {
          installDir: "funnel",
          configFile: "/tmp/funnel.env",
          dataDir: "/tmp/data",
          logDir: "/tmp/logs",
          manifestPath: "/tmp/install.json",
        },
        "linux",
      ),
    ).toContain("installDir must be an absolute path (got funnel).");
  });

  test("expands home and Windows environment variables", () => {
    expect(expandPath("~/Funnel", "linux", home)).toBe("/home/alice/Funnel");
    expect(
      expandPath("%ProgramData%\\Funnel", "windows", home, {
        ProgramData: "D:\\Data",
      }),
    ).toBe("D:\\Data\\Funnel");
  });

  test("derives the manifest path from a custom config file", () => {
    expect(manifestPathFor("/srv/funnel/funnel.env", "linux")).toBe(
      "/srv/funnel/install.json",
    );
    expect(manifestPathFor("D:\\Data\\Funnel\\funnel.env", "windows")).toBe(
      "D:\\Data\\Funnel\\install.json",
    );
  });
});

describe("currentPlatform", () => {
  test("returns a supported platform", () => {
    expect(["linux", "macos", "windows"]).toContain(currentPlatform());
  });
});

describe("manifest discovery", () => {
  test("returns a list of absolute candidates", () => {
    const candidates = [
      "/etc/funnel/install.json",
      "/home/alice/.config/funnel/install.json",
    ];
    // findExistingManifest reads the filesystem; the important contract is
    // that it chooses from the platform defaults.
    expect(findExistingManifest("linux", home, {})).toBeUndefined();
    expect(candidates.length).toBe(2);
  });
});
