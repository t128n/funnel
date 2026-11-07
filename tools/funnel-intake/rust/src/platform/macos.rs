//! macOS integration. Capture and autostart are implemented in the macOS slice.

use std::any::Any;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use crate::pipeline::{BrowserLauncher, SelectionCapture};

const UNSUPPORTED: &str = "macOS integration is not implemented yet";

pub fn hotkey_runtime() -> Result<Box<dyn super::HotkeyRuntime>, String> {
    Err(UNSUPPORTED.to_owned())
}

struct ErrorCapture;
impl SelectionCapture for ErrorCapture {
    fn foreground_process(&mut self) -> Result<String, String> {
        Err(UNSUPPORTED.to_owned())
    }
    fn capture(&mut self) -> Result<String, String> {
        Err(UNSUPPORTED.to_owned())
    }
}

struct ErrorLauncher;
impl BrowserLauncher for ErrorLauncher {
    fn open(&mut self, _url: &str) -> Result<(), String> {
        Err(UNSUPPORTED.to_owned())
    }
}

pub fn capture() -> Box<dyn SelectionCapture> {
    Box::new(ErrorCapture)
}

pub fn launcher() -> Box<dyn BrowserLauncher> {
    Box::new(ErrorLauncher)
}

pub fn pump_events() {
    std::thread::sleep(std::time::Duration::from_millis(20));
}

pub fn acquire_single_instance() -> Result<bool, String> {
    Ok(true)
}

pub fn tray(
    _open_settings: Box<dyn Fn() + Send + Sync>,
    _quit: Arc<AtomicBool>,
) -> Option<Box<dyn Any>> {
    None
}

pub fn autostart(_action: &str) -> Result<String, String> {
    Err(UNSUPPORTED.to_owned())
}

pub fn show_error(title: &str, message: &str) {
    eprintln!("{title}: {message}");
}
