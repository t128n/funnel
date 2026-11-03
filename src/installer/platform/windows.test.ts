import { describe, expect, test } from "bun:test";
import type { InstallConfig } from "../types";
import {
  createWindowsServiceManager,
  dotNetFrameworkVersion,
  firewallRuleName,
  MIN_DOTNET_RELEASE,
  parseDotNetRelease,
  parseWinSwStatus,
  renderWinSwXml,
  serviceExecutablePath,
  serviceLogPath,
  serviceXmlPath,
} from "./windows";

function makeConfig(overrides: Partial<InstallConfig> = {}): InstallConfig {
  return {
    version: "0.1.0",
    platform: "windows",
    mode: "system",
    installDir: "C:\\Program Files\\Funnel",
    configFile: "C:\\ProgramData\\Funnel\\funnel.env",
    dataDir: "C:\\ProgramData\\Funnel\\data",
    logDir: "C:\\ProgramData\\Funnel\\logs",
    manifestPath: "C:\\ProgramData\\Funnel\\install.json",
    port: 3000,
    host: "0.0.0.0",
    url: "",
    logLevel: "info",
    logMode: "file",
    force: false,
    dryRun: false,
    noElevate: false,
    serviceName: "funnel",
    launchdLabel: "io.github.t128n.funnel",
    ...overrides,
  };
}

describe("renderWinSwXml", () => {
  test("writes the executable, working directory, env, and lifecycle settings", () => {
    const xml = renderWinSwXml(makeConfig());
    expect(xml).toContain("<id>funnel</id>");
    expect(xml).toContain(
      "<executable>C:\\Program Files\\Funnel\\funnel.exe</executable>",
    );
    expect(xml).toContain(
      "<workingdirectory>C:\\ProgramData\\Funnel</workingdirectory>",
    );
    expect(xml).toContain(
      '<env name="FUNNEL_ENV_FILE" value="C:\\ProgramData\\Funnel\\funnel.env" />',
    );
    expect(xml).toContain(
      '<env name="FUNNEL_DATA_DIR" value="C:\\ProgramData\\Funnel\\data" />',
    );
    expect(xml).toContain("<startmode>Automatic</startmode>");
    expect(xml).toContain("<delayedAutoStart>true</delayedAutoStart>");
    expect(xml).toContain('<onfailure action="restart" delay="10 sec" />');
    expect(xml).toContain('<onfailure action="restart" delay="30 sec" />');
    expect(xml).toContain("<stoptimeout>35 sec</stoptimeout>");
  });

  test("uses the configured log directory and a rolled funnel-service.log", () => {
    const config = makeConfig({ logDir: "D:\\Data\\Funnel\\Logs" });
    const xml = renderWinSwXml(config);
    expect(xml).toContain('<log mode="roll-by-size">');
    expect(xml).toContain("<logpath>D:\\Data\\Funnel\\Logs</logpath>");
    expect(xml).toContain("<logname>funnel-service</logname>");
    expect(xml).toContain("<outfilepattern>.log</outfilepattern>");
    expect(xml).toContain("<sizeThreshold>10240</sizeThreshold>");
    expect(xml).toContain("<keepFiles>8</keepFiles>");
    expect(serviceLogPath(config)).toBe(
      "D:\\Data\\Funnel\\Logs\\funnel-service.log",
    );
  });

  test("escapes XML metacharacters in paths and names", () => {
    const config = makeConfig({
      installDir: "D:\\Apps & <Tools>",
      configFile: "D:\\Data & <Stuff>'s\\funnel.env",
      dataDir: "D:\\Data & <Stuff>'s\\data",
      logDir: "D:\\Logs & \"Quoted\"\\<rolled>",
    });
    const xml = renderWinSwXml(config);

    expect(xml).toContain("D:\\Apps &amp; &lt;Tools&gt;\\funnel.exe");
    expect(xml).toContain(
      'value="D:\\Data &amp; &lt;Stuff&gt;&apos;s\\funnel.env"',
    );
    expect(xml).toContain(
      "<workingdirectory>D:\\Data &amp; &lt;Stuff&gt;&apos;s</workingdirectory>",
    );
    expect(xml).toContain(
      "<logpath>D:\\Logs &amp; &quot;Quoted&quot;\\&lt;rolled&gt;</logpath>",
    );
  });

  test("uses the configured service name", () => {
    expect(renderWinSwXml(makeConfig({ serviceName: "funnel-test" }))).toContain(
      "<id>funnel-test</id>",
    );
  });

  test("does not put the port in the service definition", () => {
    // PORT stays in the env file; the firewall rule carries the listen port.
    expect(renderWinSwXml(makeConfig({ port: 4567 }))).not.toContain(
      'name="PORT"',
    );
  });
});

describe("paths and firewall", () => {
  test("derives the service files from the install and log directories", () => {
    const config = makeConfig();
    expect(serviceExecutablePath(config)).toBe(
      "C:\\Program Files\\Funnel\\funnel-service.exe",
    );
    expect(serviceXmlPath(config)).toBe(
      "C:\\Program Files\\Funnel\\funnel-service.xml",
    );
    expect(serviceLogPath(config)).toBe(
      "C:\\ProgramData\\Funnel\\logs\\funnel-service.log",
    );
  });

  test("names the firewall rule after the port", () => {
    expect(firewallRuleName(3000)).toBe("Funnel (TCP 3000)");
    expect(firewallRuleName(4567)).toBe("Funnel (TCP 4567)");
  });
});

describe("createWindowsServiceManager", () => {
  test("rejects the per-user mode with actionable guidance", () => {
    expect(() =>
      createWindowsServiceManager(makeConfig({ mode: "user" })),
    ).toThrow(/per-user Funnel service/i);
  });

  test("rejects portable mode because that adapter runs processes", () => {
    expect(() =>
      createWindowsServiceManager(makeConfig({ mode: "portable" })),
    ).toThrow(/only supports --mode system/i);
  });

  test("returns a WinSW manager for system mode", () => {
    expect(createWindowsServiceManager(makeConfig()).kind).toBe("winsw");
  });
});

describe("WinSW status parsing", () => {
  test("recognises the states WinSW prints", () => {
    expect(parseWinSwStatus("NonExistent")).toBe("NonExistent");
    expect(parseWinSwStatus("Started")).toBe("Started");
    expect(parseWinSwStatus("Stopped")).toBe("Stopped");
    expect(parseWinSwStatus("")).toBe("Unknown");
  });

  test("recognises sc.exe output and not-installed messages", () => {
    expect(parseWinSwStatus("STATE : 4 RUNNING")).toBe("Started");
    expect(parseWinSwStatus("The service does not exist")).toBe("NonExistent");
  });
});

describe(".NET Framework detection", () => {
  test("parses hex and decimal Release values", () => {
    expect(
      parseDotNetRelease(
        "    Release    REG_DWORD    0x82c3a\n",
      ),
    ).toBe(535610);
    expect(
      parseDotNetRelease("    Release    REG_DWORD    533320\n"),
    ).toBe(533320);
    expect(parseDotNetRelease("no release here")).toBeUndefined();
  });

  test("maps release numbers to framework versions", () => {
    expect(MIN_DOTNET_RELEASE).toBe(394254);
    expect(dotNetFrameworkVersion(394254)).toBe("4.6.1 or later");
    expect(dotNetFrameworkVersion(394253)).toBe("older than 4.6.1");
    expect(dotNetFrameworkVersion(528040)).toBe("4.8 or later");
    expect(dotNetFrameworkVersion(533320)).toBe("4.8.1 or later");
  });
});
