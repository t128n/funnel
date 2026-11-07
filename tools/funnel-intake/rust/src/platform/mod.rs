//! Platform integration (hotkey, selection capture, browser, autostart).

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod unsupported;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
use macos as native;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
use unsupported as native;
#[cfg(target_os = "windows")]
use windows as native;

use std::path::Path;

use crate::config::Config;

pub fn run_daemon(path: &Path, config: &Config, dry_run: bool) -> Result<(), String> {
    native::run_daemon(path, config, dry_run)
}

pub fn preview(config: &Config) -> Result<crate::pipeline::IntakeOutcome, String> {
    native::preview(config)
}

pub fn autostart(action: &str) -> Result<String, String> {
    native::autostart(action)
}
