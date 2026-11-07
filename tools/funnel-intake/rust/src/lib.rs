//! Funnel intake: one Rust app with a daemon and a Rune settings window.

/// Set by `scripts/build-intake.ts` for release builds.
pub const VERSION: &str = match option_env!("FUNNEL_INTAKE_VERSION") {
    Some(version) => version,
    None => env!("CARGO_PKG_VERSION"),
};

pub mod cli;
pub mod config;
pub mod daemon;
pub mod deeplink;
pub mod hotkey;
pub mod logging;
pub mod pipeline;
pub mod platform;
pub mod prefill;
pub mod settings;
