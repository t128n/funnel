# funnel-intake

One Rust app that turns a global hotkey into a prefilled Funnel intake draft.
It runs as a background daemon, owns the shortcut, captures the current
selection through the clipboard, and opens

```
{FUNNEL_URL}/intake?…            # or ?d=base64url(deflate-raw(json))
```

in the default browser. Nothing is submitted — the form opens as a draft. The
same executable provides a Rune settings/status window with
`funnel-intake settings`.

Targets: Windows (`Alt+F`) and macOS (`Option+F`; `Alt`/`Opt`/`Option` are
aliases). Existing config and `FUNNEL_HOTKEY` keep precedence.

## Build

The crate pins its Rust toolchain in `rust/mise.toml`:

```sh
cd tools/funnel-intake/rust
mise install
cargo build --locked
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
```

Release builds are produced by `bun scripts/build-intake.ts --platform=<platform>`
from the repository root. It writes `dist/funnel-intake.exe` on Windows and
`dist/funnel-intake` on macOS.

Rune also requires a native C toolchain and platform development libraries.
On Linux, a native C compiler and archiver are required at build time; the
local test used Zig 0.15.2's `zig cc`/`zig ar` through wrapper scripts.

## Run

```sh
funnel-intake daemon              # background hotkey owner
funnel-intake settings            # settings/status window
funnel-intake daemon --simulate "Hello world"
funnel-intake check               # validate config and exit
funnel-intake test                # capture once, print the result, exit
funnel-intake autostart enable    # current user
funnel-intake version
```

`daemon --simulate TEXT` injects a fake hotkey event and selection, runs the
real source mapping and URL encoding, and prints the URL through the launcher
trait without opening a browser. This backs the integration test and the CI
smoke test.

The daemon polls its config file and re-registers the shortcut when `hotkey`
changes, without a restart. It writes `daemon.heartbeat` beside the config so
the settings window can show whether it is running.

## Config

Windows keeps the original location
`%LOCALAPPDATA%\Funnel\Intake\config.json`. macOS uses
`~/Library/Application Support/Funnel/Intake/config.json`.

```json
{
  "url": "http://localhost:3000",
  "hotkey": "Alt+F",
  "source": "self-service",
  "sourceMap": {
    "ms-teams": "chat",
    "outlook": "email"
  }
}
```

- `url` — Funnel origin. A path is preserved (`https://host/funnel/` →
  `…/funnel/intake`); query strings and fragments are rejected.
- `hotkey` — at least one modifier plus one key. `Ctrl`/`Control`, `Alt`/`Opt`/
  `Option`, `Shift`, and `Win`/`Meta`/`Super`/`Cmd` are accepted.
- `source` — optional fixed source that disables foreground detection.
- `sourceMap` — process name (lower case, no `.exe`) to intake source. An empty
  value removes an override; built-in defaults then apply again.

Environment overrides (highest precedence after CLI flags): `FUNNEL_URL`,
`FUNNEL_HOTKEY`, `FUNNEL_SOURCE`. CLI `-url`, `-hotkey`, `-source` also win over
the environment.

## URL contract

The encoder mirrors `src/lib/client/intake-deeplink.ts`:

- `title` = first non-empty line, whitespace collapsed, max 256.
- `body` = full selection, max 65 536.
- `source` = mapped foreground app, max 128.
- Limits are counted in UTF-16 code units, matching the TypeScript `.slice`.
- The plain and `d=` (deflate-raw + base64url) forms are both built; the shorter
  one is used, and the result must fit in 8 000 characters. If a selection is
  too large, the body is trimmed to fit and the trim is logged.

## Platform notes

- Windows: `RegisterHotKey` (via `global-hotkey`, with `MOD_NOREPEAT`), Win32
  clipboard capture and `SendInput`-equivalent `keybd_event`, `ShellExecuteW`,
  a `Local\FunnelIntake` mutex, HKCU Run autostart, and a tray menu.
- macOS: a Carbon global hotkey through `global-hotkey`, `Cmd+C` through
  CoreGraphics, `pbpaste`/`pbcopy`, `open`, a LaunchAgent, and an explicit
  Accessibility-permission error. Rune has no macOS tray backend yet, so macOS
  reopens settings with `funnel-intake settings`.
- The selection is always captured **before** the browser opens; a failed or
  empty capture still opens a blank draft with the detected source.

## Headless rendering on Debian without root

The following was used on Debian 13 x86-64 with the native runtime libraries
already present. It extracts Mesa lavapipe and missing runtime libraries into a
temporary directory instead of installing them system-wide. Adjust package
filenames if the Debian package versions change.

```sh
mkdir -p /tmp/opencode/rune-libs
cd /tmp/opencode/rune-libs
apt-get download mesa-vulkan-drivers libwayland-client0 libxkbcommon0
for package in ./*.deb; do dpkg-deb -x "$package" root; done
ln -s libxkbcommon.so.0 root/usr/lib/x86_64-linux-gnu/libxkbcommon.so
export LD_LIBRARY_PATH="$PWD/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export LIBRARY_PATH="$PWD/root/usr/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
export VK_ICD_FILENAMES="$PWD/root/usr/share/vulkan/icd.d/lvp_icd.json"
cd - # return to tools/funnel-intake/rust
cargo run --locked -- settings --snap /tmp/intake.png --tree /tmp/intake-tree.json
```

The CI Linux job installs the standard development packages and uploads the
real settings window screenshot and element tree as artifacts.

## Known limitations

- Only plain-text clipboard contents are restored after a capture; images and
  files cannot be preserved.
- Windows UIPI blocks synthetic `Ctrl+C` from reaching elevated apps unless the
  helper also runs elevated.
- macOS captures require Accessibility permission.
- The captured text appears in the browser URL/history.
- Selections larger than the deeplink limit are truncated (logged, not silent).
