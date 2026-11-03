import { createLinuxServiceManager } from "./platform/linux";
import { createMacosServiceManager } from "./platform/macos";
import { createPortableServiceManager } from "./platform/portable";
import { createWindowsServiceManager } from "./platform/windows";
import type { InstallConfig, ServiceManager } from "./types";

export function createServiceManager(config: InstallConfig): ServiceManager {
  if (config.mode === "portable") {
    return createPortableServiceManager(config);
  }
  switch (config.platform) {
    case "linux":
      return createLinuxServiceManager(config);
    case "macos":
      return createMacosServiceManager(config);
    case "windows":
      return createWindowsServiceManager(config);
  }
}
