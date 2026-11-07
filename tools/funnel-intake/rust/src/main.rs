//! One executable: `funnel-intake daemon` and `funnel-intake settings`.

#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use std::process::ExitCode;

use funnel_intake::cli::{self, Command, Options};
use funnel_intake::config::load_config;
use funnel_intake::prefill::utf16_length;
use funnel_intake::{daemon, platform, settings};

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(err) => {
            eprintln!("funnel-intake: {err}");
            ExitCode::from(1)
        }
    }
}

fn run() -> Result<ExitCode, String> {
    let options = cli::parse(std::env::args().skip(1))?;
    match options.command {
        Command::Help => {
            println!("{}", cli::usage());
            Ok(ExitCode::SUCCESS)
        }
        Command::Version => {
            println!("{}", env!("CARGO_PKG_VERSION"));
            Ok(ExitCode::SUCCESS)
        }
        Command::Check => check(&options),
        Command::Test => test(&options),
        Command::Autostart => autostart(&options),
        Command::Daemon => daemon::run(&options).map(|()| ExitCode::SUCCESS),
        Command::Settings => settings::run(&options).map(|()| ExitCode::SUCCESS),
    }
}

fn check(options: &Options) -> Result<ExitCode, String> {
    let config = load_effective(options)?;
    println!(
        "config={}\nurl={}\nhotkey={}\nsource={:?}",
        options.config_path.display(),
        config.base_url,
        config.hotkey,
        config.source
    );
    Ok(ExitCode::SUCCESS)
}

fn test(options: &Options) -> Result<ExitCode, String> {
    let config = load_effective(options)?;
    let outcome = platform::preview(&config)?;
    println!(
        "source={}\ntitle={:?}\nbody={} chars\ntruncated={}\nurl={}",
        outcome.prefill.source,
        outcome.prefill.title,
        utf16_length(&outcome.prefill.body),
        outcome.truncated,
        outcome.url
    );
    if let Some(err) = outcome.capture_error {
        return Err(err);
    }
    Ok(ExitCode::SUCCESS)
}

fn autostart(options: &Options) -> Result<ExitCode, String> {
    let action = options.autostart_action.as_deref().unwrap_or("status");
    println!("{}", platform::autostart(action)?);
    Ok(ExitCode::SUCCESS)
}

fn load_effective(options: &Options) -> Result<funnel_intake::config::Config, String> {
    let mut config = load_config(&options.config_path)?;
    config.apply_cli_overrides(
        options.url.as_deref(),
        options.hotkey.as_deref(),
        options.source.as_deref(),
    );
    config.normalize()?;
    Ok(config)
}
