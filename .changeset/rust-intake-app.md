---
"funnel": patch
---

Replace the Windows-only Go intake helper with one Rust app for Windows and macOS. The background daemon owns the global shortcut, captures the foreground selection before opening a prefilled intake draft, reloads config without a restart and can start at login. A Rune settings/status window edits the same config. Windows keeps `Alt+F`; macOS defaults to `Option+F`.
