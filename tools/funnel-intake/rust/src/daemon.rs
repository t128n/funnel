//! Daemon entry point: simulation now, real platform hotkey loops below.

use crate::cli::Options;
use crate::config::load_config;
use crate::pipeline;

pub fn run(options: &Options) -> Result<(), String> {
    let mut config = load_config(&options.config_path)?;
    config.apply_cli_overrides(
        options.url.as_deref(),
        options.hotkey.as_deref(),
        options.source.as_deref(),
    );
    config.normalize()?;

    if let Some(selection) = &options.simulate {
        let outcome = pipeline::simulate(&config, selection, "simulated-app")?;
        if let Some(err) = &outcome.capture_error {
            eprintln!("capture failed: {err}");
        }
        return Ok(());
    }

    crate::platform::run_daemon(&options.config_path, &config, options.dry_run)
}
