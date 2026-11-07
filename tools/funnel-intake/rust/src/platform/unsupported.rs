//! Fallback for platforms that have no native hotkey integration.

use std::path::Path;

use crate::config::Config;
use crate::pipeline::IntakeOutcome;

const UNSUPPORTED: &str = "the intake daemon is supported on Windows and macOS only";

pub fn run_daemon(_path: &Path, _config: &Config, _dry_run: bool) -> Result<(), String> {
    Err(UNSUPPORTED.to_owned())
}

pub fn preview(_config: &Config) -> Result<IntakeOutcome, String> {
    Err(UNSUPPORTED.to_owned())
}

pub fn autostart(_action: &str) -> Result<String, String> {
    Err(UNSUPPORTED.to_owned())
}
