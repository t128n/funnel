//! Command-line parsing. The single executable exposes `daemon` and
//! `settings`; the old diagnostic flags are kept as aliases.

use std::path::PathBuf;

use crate::config::default_config_path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Daemon,
    Settings,
    Autostart,
    Check,
    Test,
    Version,
    Help,
}

#[derive(Clone, Debug)]
pub struct Options {
    pub command: Command,
    pub config_path: PathBuf,
    pub url: Option<String>,
    pub hotkey: Option<String>,
    pub source: Option<String>,
    pub debug: bool,
    pub dry_run: bool,
    pub simulate: Option<String>,
    pub autostart_action: Option<String>,
    pub args: Vec<String>,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            command: Command::Daemon,
            config_path: default_config_path(),
            url: None,
            hotkey: None,
            source: None,
            debug: false,
            dry_run: false,
            simulate: None,
            autostart_action: None,
            args: Vec::new(),
        }
    }
}

pub fn parse(args: impl IntoIterator<Item = String>) -> Result<Options, String> {
    let mut options = Options::default();
    let mut args = args.into_iter().peekable();
    let mut command_seen = false;

    while let Some(arg) = args.next() {
        if !arg.starts_with('-') && !command_seen {
            if arg == "settings" {
                // Rune parses its own tooling flags (--snap, --tree, ...) from the
                // process arguments, so leave the rest untouched.
                options.command = Command::Settings;
                let rest: Vec<String> = args.collect();
                if let Some(position) = rest
                    .iter()
                    .position(|arg| arg == "--config" || arg == "-config")
                    && let Some(value) = rest.get(position + 1)
                {
                    options.config_path = PathBuf::from(value);
                }
                if let Some(value) = rest.iter().find_map(|arg| arg.strip_prefix("--config=")) {
                    options.config_path = PathBuf::from(value);
                }
                options.args = rest;
                break;
            }
            options.command = match arg.as_str() {
                "daemon" => Command::Daemon,
                "settings" => Command::Settings,
                "autostart" => Command::Autostart,
                "check" => Command::Check,
                "test" => Command::Test,
                "version" => Command::Version,
                "help" => Command::Help,
                other => return Err(format!("unknown command {other:?}")),
            };
            command_seen = true;
            continue;
        }

        let (name, inline) = split_flag(&arg);
        let mut value = |name: &str| -> Result<String, String> {
            if let Some(value) = inline.clone() {
                return Ok(value);
            }
            args.next().ok_or_else(|| format!("{name} needs a value"))
        };

        match name.as_str() {
            "-h" | "--help" => options.command = Command::Help,
            "-version" | "--version" | "-V" => options.command = Command::Version,
            "-config" | "--config" => options.config_path = PathBuf::from(value(&name)?),
            "-url" | "--url" => options.url = Some(value(&name)?),
            "-hotkey" | "--hotkey" => options.hotkey = Some(value(&name)?),
            "-source" | "--source" => options.source = Some(value(&name)?),
            "-debug" | "--debug" => options.debug = true,
            "-dry-run" | "--dry-run" => options.dry_run = true,
            "-check" | "--check" => options.command = Command::Check,
            "-test" | "--test" => options.command = Command::Test,
            "-simulate" | "--simulate" => options.simulate = Some(value(&name)?),
            "-open" | "--open" => {}
            other
                if options.command == Command::Autostart && options.autostart_action.is_none() =>
            {
                options.autostart_action = Some(other.trim_start_matches('-').to_owned());
            }
            other => {
                if command_seen && options.command == Command::Autostart {
                    options.autostart_action = Some(other.to_owned());
                } else {
                    return Err(format!("unknown option {other:?}"));
                }
            }
        }
    }

    if options.command == Command::Autostart && options.autostart_action.is_none() {
        options.autostart_action = Some("status".to_owned());
    }
    // Rune's tooling flags are parsed by rune::run, so retain them for the
    // settings command (headless snapshots in CI use `--snap`/`--tree`).
    options.args = std::env::args().skip(1).collect();
    Ok(options)
}

fn split_flag(arg: &str) -> (String, Option<String>) {
    match arg.split_once('=') {
        Some((name, value)) => (name.to_owned(), Some(value.to_owned())),
        None => (arg.to_owned(), None),
    }
}

pub fn usage() -> String {
    format!(
        "Funnel Intake {}\n\n\
Usage: funnel-intake <command> [options]\n\n\
Commands:\n\
  daemon                 Register the global hotkey and run the intake helper\n\
  settings               Open the settings/status window\n\
  autostart [enable|disable|status]\n\
  check                  Validate the configuration and exit\n\
  test                   Capture one selection, print it, and exit\n\
  version                Print the version and exit\n\n\
Options:\n\
  -config PATH           Config file (default: {})\n\
  -url URL               Override the Funnel base URL\n\
  -hotkey COMBO          Override the global hotkey\n\
  -source NAME           Fixed source label\n\
  -dry-run               Log what would open instead of launching a browser\n\
  -simulate TEXT         Inject a fake hotkey + selection and print the URL\n\
  -debug                 Also write logs to stderr\n",
        env!("CARGO_PKG_VERSION"),
        default_config_path().display()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_str(args: &[&str]) -> Result<Options, String> {
        parse(args.iter().map(|arg| arg.to_string()))
    }

    #[test]
    fn defaults_to_daemon() {
        let options = parse_str(&[]).unwrap();
        assert_eq!(options.command, Command::Daemon);
    }

    #[test]
    fn recognises_subcommands_and_flags() {
        let options = parse_str(&["--simulate", "hello", "--url=https://x.example"]).unwrap();
        assert_eq!(options.command, Command::Daemon);
        assert_eq!(options.simulate.as_deref(), Some("hello"));
        assert_eq!(options.url.as_deref(), Some("https://x.example"));

        let options = parse_str(&["autostart", "enable"]).unwrap();
        assert_eq!(options.command, Command::Autostart);
        assert_eq!(options.autostart_action.as_deref(), Some("enable"));
    }

    #[test]
    fn go_style_flags_still_work() {
        let options = parse_str(&["-check", "-config", "/tmp/c.json"]).unwrap();
        assert_eq!(options.command, Command::Check);
        assert_eq!(options.config_path, PathBuf::from("/tmp/c.json"));
    }

    #[test]
    fn unknown_options_are_rejected() {
        assert!(parse_str(&["--nope"]).is_err());
    }
}
