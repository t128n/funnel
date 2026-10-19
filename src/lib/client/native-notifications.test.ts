import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// `native-notifications` navigates through SvelteKit's virtual `$app/navigation`
// module, which does not resolve under `bun test`. Capture the destination
// instead of booting a router. The factory must be registered before the
// dynamic import below.
const navigated: string[] = [];
mock.module("$app/navigation", () => ({
  goto: async (url: string) => {
    navigated.push(url);
  },
}));

const { enableNativeNotifications, startNativeNotifications } = await import(
  "./native-notifications"
);

const STORAGE_KEY = "funnel.nativeNotifications";

interface FakeRow {
  id: string;
  kind: string;
  url: string;
  readAt: number | null;
  createdAt: number;
  title?: string;
  body?: string;
}

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requested = 0;
  static instances: FakeNotification[] = [];
  static grantOnRequest: NotificationPermission = "granted";

  static requestPermission = mock(async (): Promise<NotificationPermission> => {
    FakeNotification.requested += 1;
    FakeNotification.permission = FakeNotification.grantOnRequest;
    return FakeNotification.grantOnRequest;
  });

  onclick: (() => void) | null = null;
  closed = false;

  constructor(
    public title: string,
    public options: NotificationOptions = {},
  ) {
    FakeNotification.instances.push(this);
  }

  close() {
    this.closed = true;
  }
}

class FakeEventSource {
  static last: FakeEventSource | null = null;
  readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close() {
    this.listeners.clear();
  }

  emit(type: string, payload: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent);
    }
  }
}

const original = {
  Notification: Object.getOwnPropertyDescriptor(globalThis, "Notification"),
  EventSource: Object.getOwnPropertyDescriptor(globalThis, "EventSource"),
  fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
};

function installStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
  return store;
}

function installBlockedStorage() {
  const blocked = () => {
    throw new Error("storage blocked");
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
      clear: blocked,
    },
  });
}

function restore(name: keyof typeof original) {
  const descriptor = original[name];
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

// Notification timestamps are epoch milliseconds; keep the fixtures ahead of
// `Date.now()` so they represent rows created after the tab subscribed.
const CREATED_BASE = Date.now() + 60_000;

const rows: FakeRow[] = [
  {
    id: "n1",
    kind: "assigned",
    url: "/issues/orgA/core/7",
    readAt: null,
    createdAt: CREATED_BASE,
    title: "Assigned to you",
    body: "core#7",
  },
  {
    id: "n2",
    kind: "comment",
    url: "/issues/orgA/core/8",
    readAt: null,
    createdAt: CREATED_BASE + 1000,
    title: "New comment",
  },
];

function installBrowser(permission: NotificationPermission = "granted") {
  FakeNotification.permission = permission;
  FakeNotification.requested = 0;
  FakeNotification.instances = [];
  FakeNotification.grantOnRequest = "granted";
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    writable: true,
    value: FakeNotification,
  });
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: FakeEventSource,
  });
  FakeEventSource.last = null;
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).focus = () => {};
}

function installFetch(items: FakeRow[] = rows) {
  const calls: string[] = [];
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: mock(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return {
        ok: true,
        json: async () => ({ items, unreadCount: items.length }),
      } as Response;
    }),
  });
  return calls;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  navigated.length = 0;
});

afterEach(() => {
  restore("Notification");
  restore("EventSource");
  restore("fetch");
  restore("localStorage");
  restore("window");
});

describe("enableNativeNotifications", () => {
  test("test_unsupported_environment_returns_unsupported", async () => {
    delete (globalThis as Record<string, unknown>).Notification;
    installStorage();

    await expect(enableNativeNotifications()).resolves.toBe("unsupported");
  });

  test("granted permission opts this browser in", async () => {
    const store = installStorage();
    installBrowser("default");

    await expect(enableNativeNotifications()).resolves.toBe("granted");
    expect(FakeNotification.requested).toBe(1);
    expect(store.get(STORAGE_KEY)).toBe("true");
  });

  test("denied permission is reported and not persisted", async () => {
    const store = installStorage();
    installBrowser("default");
    FakeNotification.grantOnRequest = "denied";

    await expect(enableNativeNotifications()).resolves.toBe("denied");
    expect(store.get(STORAGE_KEY)).toBeUndefined();
  });
});

describe("startNativeNotifications", () => {
  test("test_disabled_setting_never_requests_permission", () => {
    installStorage({ [STORAGE_KEY]: "true" });
    installBrowser("granted");

    const stop = startNativeNotifications(false);

    expect(typeof stop).toBe("function");
    expect(FakeNotification.requested).toBe(0);
    expect(FakeEventSource.last).toBeNull();
    stop();
  });

  test("an ineligible browser never opens the stream", () => {
    installStorage();
    installBrowser("granted");

    const stop = startNativeNotifications(true);

    expect(FakeEventSource.last).toBeNull();
    stop();
  });

  test("test_event_fetches_own_feed_only", async () => {
    installStorage({ [STORAGE_KEY]: "true" });
    installBrowser("granted");
    const calls = installFetch();

    const stop = startNativeNotifications(true);
    FakeEventSource.last!.emit("notifications", { type: "notifications" });
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toStartWith("/api/notifications?after=");
    expect(calls[0]).toContain("unread=1");
    expect(calls[0]).not.toMatch(/user/i);
    expect(FakeNotification.instances).toHaveLength(rows.length);
    expect(FakeNotification.instances[0].title).toBe("Assigned to you");
    expect(FakeNotification.instances[1].title).toBe("New comment");

    // `lastSeen` advances in memory, so a second signal only asks for newer rows.
    FakeEventSource.last!.emit("notifications", { type: "notifications" });
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain(`after=${CREATED_BASE + 1000}`);

    stop();
  });

  test("opting in after mount starts the listener without a reload", async () => {
    const store = installStorage();
    installBrowser("default");
    const calls = installFetch();

    const stop = startNativeNotifications(true);
    expect(FakeEventSource.last).toBeNull();

    await expect(enableNativeNotifications()).resolves.toBe("granted");
    expect(store.get(STORAGE_KEY)).toBe("true");
    expect(FakeEventSource.last).not.toBeNull();

    FakeEventSource.last!.emit("notifications", { type: "notifications" });
    await settle();

    expect(calls).toHaveLength(1);
    expect(FakeNotification.instances).toHaveLength(rows.length);

    stop();
    expect(FakeEventSource.last!.listeners.size).toBe(0);
  });

  test("a granted opt-in works in this tab when storage is blocked", async () => {
    installBlockedStorage();
    installBrowser("default");
    const calls = installFetch();

    const stop = startNativeNotifications(true);
    await expect(enableNativeNotifications()).resolves.toBe("granted");
    expect(FakeEventSource.last).not.toBeNull();

    FakeEventSource.last!.emit("notifications", { type: "notifications" });
    await settle();

    expect(calls).toHaveLength(1);

    stop();
  });

  test("ignores other event types and cleans up", async () => {
    installStorage({ [STORAGE_KEY]: "true" });
    installBrowser("granted");
    const calls = installFetch();

    const stop = startNativeNotifications(true);
    FakeEventSource.last!.emit("sync", { type: "sync" });
    await settle();
    expect(calls).toHaveLength(0);

    stop();
    expect(FakeEventSource.last!.listeners.size).toBe(0);
  });

  test("clicking focuses the tab and opens the notification url", async () => {
    installStorage({ [STORAGE_KEY]: "true" });
    installBrowser("granted");
    installFetch();
    let focused = 0;
    (globalThis as Record<string, unknown>).focus = () => {
      focused += 1;
    };

    const stop = startNativeNotifications(true);
    FakeEventSource.last!.emit("notifications", { type: "notifications" });
    await settle();

    FakeNotification.instances[0].onclick?.();
    expect(focused).toBe(1);
    expect(navigated).toEqual(["/issues/orgA/core/7"]);

    stop();
  });
});
