//! macOS integration. Implemented in the macOS slice.

use std::path::Path;

use crate::config::Config;
use crate::pipeline::IntakeOutcome;

pub fn run_daemon(_path: &Path, _config: &Config, _dry_run: bool) -> Result<(), String> {
    Err("macOS daemon is not implemented yet".to_owned())
}

pub fn preview(_config: &Config) -> Result<IntakeOutcome, String> {
    Err("macOS capture is not implemented yet".to_owned())
}

pub fn autostart(_action: &str) -> Result<String, String> {
    Err("macOS autostart is not implemented yet".to_owned())
}
