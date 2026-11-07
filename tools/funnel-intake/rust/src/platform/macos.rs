//! macOS integration: global hotkey, frontmost app, Cmd+C capture through the
//! pasteboard, browser launch, Accessibility errors and a LaunchAgent.

use std::any::Any;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

use crate::config::default_config_path;
use crate::logging;
use crate::pipeline::{BrowserLauncher, SelectionCapture};

use super::HotkeyRuntime;

const MODIFIER_MASK: u64 = 0x0002_0000 | 0x0004_0000 | 0x0008_0000 | 0x0010_0000;
const KEY_C: u16 = 0x08;
const COMMAND_FLAG: u64 = 0x0010_0000;
const LAUNCH_AGENT: &str = "com.t128n.funnel.intake.plist";

pub fn hotkey_runtime() -> Result<Box<dyn HotkeyRuntime>, String> {
    Ok(Box::new(super::HotkeyRuntimeImpl::new()?))
}

pub fn capture() -> Box<dyn SelectionCapture> {
    Box::new(MacCapture)
}

pub fn launcher() -> Box<dyn BrowserLauncher> {
    Box::new(OpenLauncher)
}

pub fn pump_events() {
    unsafe {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.05, 1);
    }
}

pub fn acquire_single_instance() -> Result<bool, String> {
    let config_path = default_config_path();
    let dir = config_path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir).map_err(|err| format!("create {}: {err}", dir.display()))?;
    let path = dir.join("intake.lock");
    let file = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&path)
        .map_err(|err| format!("open {}: {err}", path.display()))?;
    match file.try_lock() {
        Ok(()) => {
            // Keep the lock for the process lifetime.
            std::mem::forget(file);
            Ok(true)
        }
        Err(std::fs::TryLockError::WouldBlock) => Ok(false),
        Err(std::fs::TryLockError::Error(err)) => Err(format!("lock {}: {err}", path.display())),
    }
}

pub fn tray(
    _open_settings: Box<dyn Fn() + Send + Sync>,
    _quit: Arc<AtomicBool>,
) -> Option<Box<dyn Any>> {
    // Rune's tray backend is Windows/Linux only; macOS uses the settings command.
    None
}

pub fn autostart(action: &str) -> Result<String, String> {
    let path = launch_agent_path()?;
    match action {
        "enable" => {
            let exe = std::env::current_exe().map_err(|err| format!("current exe: {err}"))?;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|err| format!("create {}: {err}", parent.display()))?;
            }
            fs::write(&path, launch_agent_plist(&exe))
                .map_err(|err| format!("write {}: {err}", path.display()))?;
            let _ = Command::new("/bin/launchctl")
                .args(["unload", path.to_string_lossy().as_ref()])
                .output();
            let _ = Command::new("/bin/launchctl")
                .args(["load", "-w", path.to_string_lossy().as_ref()])
                .output();
            Ok(format!("enabled: {}", path.display()))
        }
        "disable" => {
            let _ = Command::new("/bin/launchctl")
                .args(["unload", path.to_string_lossy().as_ref()])
                .output();
            match fs::remove_file(&path) {
                Ok(()) => Ok("disabled".to_owned()),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok("disabled".to_owned()),
                Err(err) => Err(format!("remove {}: {err}", path.display())),
            }
        }
        "status" => {
            if path.exists() {
                Ok(format!("enabled: {}", path.display()))
            } else {
                Ok("disabled".to_owned())
            }
        }
        other => Err(format!("unknown autostart action {other:?}")),
    }
}

pub fn show_error(title: &str, message: &str) {
    logging::log(format!("{title}: {message}"));
    let script = format!(
        "display alert \"{}\" message \"{}\" as critical",
        escape_applescript(title),
        escape_applescript(message)
    );
    let _ = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
        .spawn();
}

struct MacCapture;

impl SelectionCapture for MacCapture {
    fn foreground_process(&mut self) -> Result<String, String> {
        frontmost_process()
    }

    fn capture(&mut self) -> Result<String, String> {
        capture_selection()
    }
}

struct OpenLauncher;

impl BrowserLauncher for OpenLauncher {
    fn open(&mut self, url: &str) -> Result<(), String> {
        let status = Command::new("/usr/bin/open")
            .arg(url)
            .status()
            .map_err(|err| format!("open: {err}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with {status}"))
        }
    }
}

fn capture_selection() -> Result<String, String> {
    if !accessibility_trusted() {
        return Err(
            "Accessibility permission is required. Enable Funnel Intake in System Settings > \
             Privacy & Security > Accessibility, then try again."
                .to_owned(),
        );
    }
    if !wait_for_modifiers_released(Duration::from_millis(750)) {
        logging::log("hotkey modifiers still held after 750ms; capturing anyway");
    }

    let original = read_clipboard();
    let result = (|| {
        let sentinel = new_sentinel();
        write_clipboard(&sentinel)?;
        send_copy()?;

        let deadline = Instant::now() + Duration::from_millis(1200);
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(30));
            let current = read_clipboard();
            if current.trim() == sentinel {
                continue;
            }
            if current != original || !current.is_empty() {
                return Ok(current);
            }
        }
        Ok(String::new())
    })();

    if let Err(err) = write_clipboard(&original) {
        logging::log(format!("restore clipboard: {err}"));
    }
    result
}

fn read_clipboard() -> String {
    match Command::new("/usr/bin/pbpaste").output() {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).to_string()
        }
        _ => String::new(),
    }
}

fn write_clipboard(text: &str) -> Result<(), String> {
    let mut child = Command::new("/usr/bin/pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|err| format!("pbcopy: {err}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|err| format!("pbcopy stdin: {err}"))?;
    }
    let status = child.wait().map_err(|err| format!("pbcopy wait: {err}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("pbcopy exited with {status}"))
    }
}

fn send_copy() -> Result<(), String> {
    unsafe {
        let down = CGEventCreateKeyboardEvent(std::ptr::null(), KEY_C, true);
        if down.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_owned());
        }
        CGEventSetFlags(down, COMMAND_FLAG);
        CGEventPost(0, down);
        CFRelease(down);

        let up = CGEventCreateKeyboardEvent(std::ptr::null(), KEY_C, false);
        if up.is_null() {
            return Err("CGEventCreateKeyboardEvent failed".to_owned());
        }
        CGEventSetFlags(up, COMMAND_FLAG);
        CGEventPost(0, up);
        CFRelease(up);
    }
    Ok(())
}

fn wait_for_modifiers_released(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let flags = unsafe { CGEventSourceFlagsState(0) };
        if flags & MODIFIER_MASK == 0 {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

fn accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

fn frontmost_process() -> Result<String, String> {
    if let Some(name) = frontmost_via_lsappinfo() {
        return Ok(name);
    }
    let output = Command::new("/usr/bin/osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ])
        .output()
        .map_err(|err| format!("osascript: {err}"))?;
    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if !name.is_empty() {
            return Ok(name);
        }
    }
    Err("could not determine the frontmost application".to_owned())
}

fn frontmost_via_lsappinfo() -> Option<String> {
    let front = Command::new("/usr/bin/lsappinfo")
        .arg("front")
        .output()
        .ok()?;
    if !front.status.success() {
        return None;
    }
    let asn = String::from_utf8_lossy(&front.stdout).trim().to_owned();
    if asn.is_empty() {
        return None;
    }
    let info = Command::new("/usr/bin/lsappinfo")
        .args(["info", "-only", "name", &asn])
        .output()
        .ok()?;
    if !info.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&info.stdout);
    let value = text.split_once('=')?.1.trim().trim_matches('"').to_owned();
    (!value.is_empty()).then_some(value)
}

fn new_sentinel() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("funnel-intake-{nanos}")
}

fn launch_agent_path() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_owned())?;
    Ok(Path::new(&home)
        .join("Library")
        .join("LaunchAgents")
        .join(LAUNCH_AGENT))
}

fn launch_agent_plist(exe: &Path) -> String {
    let exe = xml_escape(&exe.to_string_lossy());
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.t128n.funnel.intake</string>
  <key>ProgramArguments</key>
  <array><string>{exe}</string><string>daemon</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
</dict>
</plist>
"#
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGEventCreateKeyboardEvent(
        source: *const std::ffi::c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut std::ffi::c_void;
    fn CGEventSetFlags(event: *mut std::ffi::c_void, flags: u64);
    fn CGEventPost(tap: u32, event: *mut std::ffi::c_void);
    fn CGEventSourceFlagsState(state_id: i32) -> u64;
    fn CFRelease(value: *const std::ffi::c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    static kCFRunLoopDefaultMode: *const std::ffi::c_void;
    fn CFRunLoopRunInMode(
        mode: *const std::ffi::c_void,
        seconds: f64,
        return_after_source_handled: u8,
    ) -> i32;
}
