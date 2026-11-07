# Rust replacement (work in progress)

This is not the release helper. It does not yet register a shortcut, capture a
selection, open a draft, persist settings, or provide a system tray. Continue
using the existing Go helper until those features have been ported and verified.

The Rune shell starts from `examples/hello` and pins a Rune revision. Use
`mise install` in this directory to install its Rust toolchain, then `cargo run`
to run it. Rune also requires a native C toolchain and platform development
libraries. Headless inspection uses `cargo run -- --snap /tmp/intake.png --tree /tmp/intake-tree.json`.

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
cargo run --locked -- --snap /tmp/intake.png --tree /tmp/intake-tree.json
```

A C compiler and archiver are still required at build time. The local test used
Zig 0.15.2's `zig cc` and `zig ar` via wrapper scripts; when used with cc-rs,
the wrapper translates `--target=x86_64-unknown-linux-gnu` to Zig's
`--target=x86_64-linux-gnu`. GitHub Actions instead installs the standard
development packages and publishes the headless image and element tree.
