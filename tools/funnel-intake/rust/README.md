# Rust replacement (work in progress)

This is not the release helper. It does not yet register a shortcut, capture a
selection, open a draft, persist settings, or provide a system tray. Continue
using the existing Go helper until those features have been ported and verified.

The Rune shell starts from `examples/hello` and pins a Rune revision. Use
`mise install` in this directory to install its Rust toolchain, then `cargo run`
to run it. Rune also requires a native C toolchain and platform development
libraries. Headless inspection uses `cargo run -- --snap /tmp/intake.png --tree /tmp/intake-tree.json`.
