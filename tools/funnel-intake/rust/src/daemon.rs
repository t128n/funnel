//! Daemon entry point and the shared config-reload loop.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use crate::cli::Options;
use crate::config::{Config, load_config, load_config_with_env};
use crate::hotkey::Hotkey;
use crate::logging;
use crate::pipeline::{BrowserLauncher, IntakeOutcome, SelectionCapture, run_intake};
use crate::platform;
#[cfg(test)]
use crate::platform::HotkeyRuntime;
use crate::prefill::utf16_length;

#[derive(Clone, Debug, Default)]
struct Overrides {
    url: Option<String>,
    hotkey: Option<String>,
    source: Option<String>,
}

impl Overrides {
    fn from_options(options: &Options) -> Self {
        Overrides {
            url: options.url.clone(),
            hotkey: options.hotkey.clone(),
            source: options.source.clone(),
        }
    }

    fn apply(&self, config: &mut Config) {
        config.apply_cli_overrides(
            self.url.as_deref(),
            self.hotkey.as_deref(),
            self.source.as_deref(),
        );
    }
}

struct DaemonCore {
    path: PathBuf,
    config: Config,
    signature: u64,
    overrides: Overrides,
}

impl DaemonCore {
    fn new(path: &Path, config: Config, overrides: Overrides) -> Self {
        DaemonCore {
            path: path.to_owned(),
            config,
            signature: file_signature(path),
            overrides,
        }
    }

    fn config(&self) -> &Config {
        &self.config
    }

    fn active_hotkey(&self) -> Hotkey {
        Hotkey::parse(&self.config.hotkey).expect("normalized config has a valid hotkey")
    }

    fn reload_if_changed(&mut self) -> Result<Option<Hotkey>, String> {
        self.reload_with_env(|name| std::env::var(name).ok())
    }

    fn reload_with_env(
        &mut self,
        env: impl Fn(&str) -> Option<String>,
    ) -> Result<Option<Hotkey>, String> {
        let signature = file_signature(&self.path);
        if signature == self.signature {
            return Ok(None);
        }

        let mut config = load_config_with_env(&self.path, env)?;
        self.overrides.apply(&mut config);
        config.normalize()?;

        let old_hotkey = Hotkey::parse(&self.config.hotkey)?;
        let new_hotkey = Hotkey::parse(&config.hotkey)?;
        self.signature = signature;
        self.config = config;
        if old_hotkey == new_hotkey {
            Ok(None)
        } else {
            Ok(Some(new_hotkey))
        }
    }
}

/// The daemon writes this file on a timer so the settings window can show
/// whether it is running without relying on process names.
pub fn heartbeat_path(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("daemon.heartbeat")
}

pub const DAEMON_STALE_AFTER: Duration = Duration::from_secs(6);

pub fn daemon_running(config_path: &Path) -> bool {
    let path = heartbeat_path(config_path);
    fs::metadata(&path)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_some_and(|age| age < DAEMON_STALE_AFTER)
}

fn write_heartbeat(config_path: &Path) {
    let _ = fs::write(
        heartbeat_path(config_path),
        format!("{} {}\n", std::process::id(), now_seconds()),
    );
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn file_signature(path: &Path) -> u64 {
    let mut hasher = DefaultHasher::new();
    match fs::read(path) {
        Ok(bytes) => {
            bytes.hash(&mut hasher);
        }
        Err(_) => {
            u64::MAX.hash(&mut hasher);
        }
    }
    hasher.finish()
}

pub fn run(options: &Options) -> Result<(), String> {
    let mut config = load_config(&options.config_path)?;
    config.apply_cli_overrides(
        options.url.as_deref(),
        options.hotkey.as_deref(),
        options.source.as_deref(),
    );
    config.normalize()?;

    if let Some(selection) = &options.simulate {
        let outcome = crate::pipeline::simulate(&config, selection, "simulated-app")?;
        if let Some(err) = &outcome.capture_error {
            eprintln!("capture failed: {err}");
        }
        return Ok(());
    }

    if !platform::supported() {
        return Err("the intake daemon is supported on Windows and macOS only".to_owned());
    }

    let dir = options
        .config_path
        .parent()
        .unwrap_or_else(|| Path::new("."));
    logging::init(dir, options.debug);

    let core = DaemonCore::new(
        &options.config_path,
        config,
        Overrides::from_options(options),
    );
    run_loop(core, options.dry_run)
}

fn run_loop(mut core: DaemonCore, dry_run: bool) -> Result<(), String> {
    if !platform::acquire_single_instance()? {
        logging::log("another instance is already running; exiting");
        return Ok(());
    }

    write_heartbeat(&core.path);
    let mut last_heartbeat = Instant::now();
    let mut runtime = platform::hotkey_runtime()?;
    let mut active = core.active_hotkey();
    runtime.register(&active)?;
    logging::log(format!(
        "starting: hotkey={} url={}",
        active,
        core.config().base_url
    ));

    let quit = Arc::new(AtomicBool::new(false));
    let _tray = platform::tray(Box::new(open_settings), quit.clone());

    let mut capture: Box<dyn SelectionCapture> = platform::capture();
    let mut launcher: Box<dyn BrowserLauncher> = if dry_run {
        Box::new(DryRunLauncher)
    } else {
        platform::launcher()
    };
    let busy = AtomicBool::new(false);

    while !quit.load(Ordering::SeqCst) {
        runtime.pump();
        if last_heartbeat.elapsed() >= Duration::from_secs(1) {
            write_heartbeat(&core.path);
            last_heartbeat = Instant::now();
        }
        while runtime.take_press() {
            if busy
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_err()
            {
                logging::log("capture already in progress; ignoring hotkey");
                continue;
            }
            let config = core.config().clone();
            match run_intake(&config, &mut *capture, &mut *launcher) {
                Ok(outcome) => log_outcome(&outcome),
                Err(err) => {
                    logging::log(format!("intake failed: {err}"));
                    platform::show_error("Funnel Intake", &err);
                }
            }
            busy.store(false, Ordering::SeqCst);
        }

        match core.reload_if_changed() {
            Ok(Some(new_hotkey)) => {
                if let Err(err) = runtime.unregister(&active) {
                    logging::log(format!("unregister hotkey: {err}"));
                }
                match runtime.register(&new_hotkey) {
                    Ok(()) => {
                        logging::log(format!("config reloaded: hotkey={new_hotkey}"));
                        active = new_hotkey;
                    }
                    Err(err) => {
                        logging::log(format!("re-register hotkey: {err}"));
                        // Restore the previous binding so the daemon stays usable.
                        let _ = runtime.register(&active);
                    }
                }
            }
            Ok(None) => {}
            Err(err) => logging::log(format!("config reload failed: {err}")),
        }
    }

    let _ = runtime.unregister(&active);
    let _ = fs::remove_file(heartbeat_path(&core.path));
    logging::log("stopped");
    Ok(())
}

fn log_outcome(outcome: &IntakeOutcome) {
    if let Some(err) = &outcome.foreground_error {
        logging::log(format!("foreground app: {err}"));
    }
    if let Some(err) = &outcome.capture_error {
        logging::log(format!("capture failed: {err}"));
    }
    if outcome.prefill.body.trim().is_empty() {
        logging::log(format!(
            "no selection captured (app={} source={}); opening blank form",
            outcome.process, outcome.source
        ));
    }
    if outcome.truncated {
        logging::log("selection trimmed to fit the 8000-character deeplink limit");
    }
    logging::log(format!(
        "opened intake (app={} source={} title={} chars body={} chars)",
        outcome.process,
        outcome.source,
        utf16_length(&outcome.prefill.title),
        utf16_length(&outcome.prefill.body),
    ));
}

fn open_settings() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let mut command = Command::new(exe);
    command.arg("settings");
    if let Some(path) = default_config_argument() {
        command.arg("--config").arg(path);
    }
    let _ = command.spawn();
}

fn default_config_argument() -> Option<String> {
    // The daemon may have been started with -config; the settings window can be
    // opened later, so fall back to the platform default.
    std::env::args()
        .skip(1)
        .skip_while(|arg| arg != "-config" && arg != "--config")
        .nth(1)
}

struct DryRunLauncher;

impl BrowserLauncher for DryRunLauncher {
    fn open(&mut self, url: &str) -> Result<(), String> {
        logging::log(format!(
            "dry-run: would open intake URL ({} bytes)",
            url.len()
        ));
        Ok(())
    }
}

/// Applies a reloaded hotkey through a registrar. Used by the real loop and by
/// the reload test.
#[cfg(test)]
fn rekey(runtime: &mut dyn HotkeyRuntime, old: &Hotkey, new: &Hotkey) -> Result<(), String> {
    runtime.unregister(old)?;
    runtime.register(new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    struct FakeRuntime {
        registered: Rc<RefCell<Vec<String>>>,
    }

    impl HotkeyRuntime for FakeRuntime {
        fn register(&mut self, hotkey: &Hotkey) -> Result<(), String> {
            self.registered.borrow_mut().push(hotkey.canonical());
            Ok(())
        }
        fn unregister(&mut self, _hotkey: &Hotkey) -> Result<(), String> {
            Ok(())
        }
        fn pump(&mut self) {}
        fn take_press(&mut self) -> bool {
            false
        }
    }

    fn temp_config(name: &str, contents: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "funnel-intake-reload-{}-{}",
            std::process::id(),
            name
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.json");
        fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn changing_the_shortcut_re_registers_it() {
        let path = temp_config("rekey", r#"{"hotkey":"Alt+F"}"#);
        let config = load_config_with_env(&path, |_| None).unwrap();
        let mut core = DaemonCore::new(&path, config, Overrides::default());
        let registered = Rc::new(RefCell::new(Vec::new()));
        let mut runtime = FakeRuntime {
            registered: registered.clone(),
        };
        let old = core.active_hotkey();
        runtime.register(&old).unwrap();

        fs::write(&path, r#"{"hotkey":"Ctrl+Alt+K"}"#).unwrap();
        let new = core
            .reload_with_env(|_| None)
            .unwrap()
            .expect("changed hotkey should reload");
        rekey(&mut runtime, &old, &new).unwrap();

        assert_eq!(*registered.borrow(), vec!["Alt+F", "Ctrl+Alt+K"]);
        assert_eq!(core.config().hotkey, "Ctrl+Alt+K");
    }

    #[test]
    fn unchanged_config_does_not_reload() {
        let path = temp_config("unchanged", r#"{"hotkey":"Alt+F"}"#);
        let config = load_config_with_env(&path, |_| None).unwrap();
        let mut core = DaemonCore::new(&path, config, Overrides::default());
        assert!(core.reload_with_env(|_| None).unwrap().is_none());
    }

    #[test]
    fn invalid_reload_keeps_the_old_configuration() {
        let path = temp_config("invalid", r#"{"hotkey":"Alt+F"}"#);
        let config = load_config_with_env(&path, |_| None).unwrap();
        let mut core = DaemonCore::new(&path, config, Overrides::default());
        fs::write(&path, r#"{"hotkey":"NotAKey"}"#).unwrap();
        assert!(core.reload_with_env(|_| None).is_err());
        assert_eq!(core.config().hotkey, "Alt+F");
    }
}
