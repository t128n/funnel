//! Platform integration (hotkey, selection capture, browser, autostart).

use std::any::Any;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use crate::config::Config;
use crate::hotkey::Hotkey;
use crate::pipeline::{BrowserLauncher, IntakeOutcome, SelectionCapture, run_intake};

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod hotkey_runtime;
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub use hotkey_runtime::Runtime as HotkeyRuntimeImpl;

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

/// The daemon's view of a platform hotkey registrar.
pub trait HotkeyRuntime {
    fn register(&mut self, hotkey: &Hotkey) -> Result<(), String>;
    fn unregister(&mut self, hotkey: &Hotkey) -> Result<(), String>;
    /// Pump the platform event loop, blocking for a short moment.
    fn pump(&mut self);
    /// True when a registered hotkey was pressed since the last call.
    fn take_press(&mut self) -> bool;
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
impl HotkeyRuntime for HotkeyRuntimeImpl {
    fn register(&mut self, hotkey: &Hotkey) -> Result<(), String> {
        HotkeyRuntimeImpl::register(self, hotkey)
    }

    fn unregister(&mut self, hotkey: &Hotkey) -> Result<(), String> {
        HotkeyRuntimeImpl::unregister(self, hotkey)
    }

    fn pump(&mut self) {
        HotkeyRuntimeImpl::pump(self);
    }

    fn take_press(&mut self) -> bool {
        HotkeyRuntimeImpl::take_press(self)
    }
}

pub fn supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

pub fn hotkey_runtime() -> Result<Box<dyn HotkeyRuntime>, String> {
    native::hotkey_runtime()
}

pub fn capture() -> Box<dyn SelectionCapture> {
    native::capture()
}

pub fn launcher() -> Box<dyn BrowserLauncher> {
    native::launcher()
}

pub fn acquire_single_instance() -> Result<bool, String> {
    native::acquire_single_instance()
}

pub fn tray(
    open_settings: Box<dyn Fn() + Send + Sync>,
    quit: Arc<AtomicBool>,
) -> Option<Box<dyn Any>> {
    native::tray(open_settings, quit)
}

pub fn autostart(action: &str) -> Result<String, String> {
    native::autostart(action)
}

pub fn show_error(title: &str, message: &str) {
    native::show_error(title, message);
}

struct NoopLauncher;

impl BrowserLauncher for NoopLauncher {
    fn open(&mut self, _url: &str) -> Result<(), String> {
        Ok(())
    }
}

/// One capture without opening a browser, backing `funnel-intake test`.
pub fn preview(config: &Config) -> Result<IntakeOutcome, String> {
    let mut capture = capture();
    let mut launcher = NoopLauncher;
    run_intake(config, &mut *capture, &mut launcher)
}
