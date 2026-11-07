# Rust crate

Implementation of the Funnel intake app. See
[`../README.md`](../README.md) for the user-facing commands, config, URL
contract and platform notes.

```sh
mise install
cargo build --locked
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo fmt --check
```

`mise.toml` pins Rust 1.99.1. Rune requires a native C toolchain and platform
development libraries. On Linux, the local headless test used Zig 0.15.2's
`zig cc`/`zig ar` through wrapper scripts and Mesa lavapipe extracted into a
temporary directory; the exact setup is in the parent README.

Headless inspection of the real settings window:

```sh
cargo run --locked -- settings --snap /tmp/intake.png --tree /tmp/intake-tree.json
```
