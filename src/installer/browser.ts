function isBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  // Never hand a non-URL to the platform opener. On Windows `cmd /c start`
  // treats it as a file name and pops up "Windows cannot find ...".
  if (!isBrowserUrl(url)) return false;

  const command =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  try {
    const child = Bun.spawn(command, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
