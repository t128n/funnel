/**
 * App-hotkey catalog.
 *
 * Declarations only — no callbacks and no components — so this module can be
 * imported by the app shell, the hint helpers, and unit tests. Components
 * attach the work with `createHotkey`, which reads the effective binding from
 * `HotkeysProvider` (default or user-customised) at registration time.
 *
 * `@tanstack/hotkeys` (the framework-agnostic core) is imported directly so
 * the module stays free of `.svelte` files and remains loadable under
 * `bun test`.
 */
import { defineAppHotkeys } from '@tanstack/hotkeys';

export const appHotkeys = defineAppHotkeys({
  'nav.search': {
    hotkey: 'Mod+K',
    meta: { name: 'Search', group: 'Navigation' }
  },
  'nav.search-slash': {
    hotkey: '/',
    meta: { name: 'Search (/)', group: 'Navigation' }
  },
  'app.settings': {
    hotkey: 'Mod+,',
    meta: { name: 'Settings', group: 'Application' }
  },
  'issue.create': {
    hotkey: 'C',
    meta: { name: 'New issue', group: 'Issues' }
  },
  'issue.status': {
    hotkey: 'S',
    meta: { name: 'Change status of focused item', group: 'Issues' }
  },
  'issue.select': {
    hotkey: 'X',
    meta: { name: 'Select or open the focused item', group: 'Issues' }
  },
  'list.next': {
    hotkey: 'J',
    meta: { name: 'Next row', group: 'Lists' }
  },
  'list.previous': {
    hotkey: 'K',
    meta: { name: 'Previous row', group: 'Lists' }
  },
  'list.open': {
    hotkey: 'Enter',
    meta: { name: 'Open focused row', group: 'Lists' }
  },
  'list.dismiss': {
    hotkey: 'Escape',
    meta: { name: 'Clear selection or close overlay', group: 'Lists' }
  }
});

declare module '@tanstack/hotkeys' {
  interface Register {
    appHotkeys: typeof appHotkeys;
  }
}
