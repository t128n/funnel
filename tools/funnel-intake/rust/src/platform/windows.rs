//! Windows integration: global hotkey, foreground process, clipboard capture,
//! browser launch, autostart and tray.

use std::any::Any;
use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_ALREADY_EXISTS, ERROR_FILE_NOT_FOUND, GetLastError, GlobalFree, HANDLE,
    HINSTANCE, HWND,
};
use windows_sys::Win32::System::DataExchange::{
    GetClipboardData, GetClipboardSequenceNumber, IsClipboardFormatAvailable, OpenClipboard,
    SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows_sys::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ, RegCloseKey, RegCreateKeyExW,
    RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW,
};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, KEYEVENTF_KEYUP, VK_C, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    keybd_event,
};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetForegroundWindow, GetWindowThreadProcessId, MB_ICONERROR, MB_OK, MSG,
    MessageBoxW, PM_REMOVE, PeekMessageW, SW_SHOWNORMAL, TranslateMessage,
};

use crate::logging;
use crate::pipeline::{BrowserLauncher, SelectionCapture};

use super::HotkeyRuntime;

const CF_UNICODETEXT: u32 = 13;
const AUTOSTART_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const AUTOSTART_NAME: &str = "Funnel Intake";

pub fn hotkey_runtime() -> Result<Box<dyn HotkeyRuntime>, String> {
    Ok(Box::new(super::HotkeyRuntimeImpl::new()?))
}

pub fn capture() -> Box<dyn SelectionCapture> {
    Box::new(WindowsCapture)
}

pub fn launcher() -> Box<dyn BrowserLauncher> {
    Box::new(ShellLauncher)
}

pub fn pump_events() {
    unsafe {
        let mut message: MSG = std::mem::zeroed();
        while PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
    std::thread::sleep(Duration::from_millis(20));
}

pub fn acquire_single_instance() -> Result<bool, String> {
    let name = to_wide(r"Local\FunnelIntake");
    let handle: HANDLE = unsafe { CreateMutexW(std::ptr::null(), 1, name.as_ptr()) };
    if handle.is_null() {
        return Err(format!("CreateMutex: {}", last_error()));
    }
    let error = unsafe { GetLastError() };
    if error == ERROR_ALREADY_EXISTS {
        unsafe { CloseHandle(handle) };
        return Ok(false);
    }
    // The handle stays open for the process lifetime; Windows closes it on exit.
    let _ = handle;
    Ok(true)
}

pub fn tray(
    open_settings: Box<dyn Fn() + Send + Sync>,
    quit: Arc<AtomicBool>,
) -> Option<Box<dyn Any>> {
    use rune::tray::{Tray, TrayIcon, TrayItem, TraySpec};

    let icon = TrayIcon::rgba(16, 16, funnel_icon());
    let spec = TraySpec::new("funnel-intake", "Funnel Intake", icon)
        .tooltip("Funnel Intake")
        .menu(vec![
            TrayItem::action("settings", "Open settings"),
            TrayItem::Separator,
            TrayItem::action("quit", "Quit"),
        ]);
    match Tray::new(spec, move |event| {
        use rune::tray::TrayEvent;
        match event {
            TrayEvent::Activate { .. } => open_settings(),
            TrayEvent::Menu(id) if id == "settings" => open_settings(),
            TrayEvent::Menu(id) if id == "quit" => {
                quit.store(true, Ordering::SeqCst);
            }
            _ => {}
        }
    }) {
        Ok(tray) => Some(Box::new(tray)),
        Err(err) => {
            logging::log(format!("tray unavailable: {err}"));
            None
        }
    }
}

pub fn autostart(action: &str) -> Result<String, String> {
    match action {
        "enable" => enable_autostart(),
        "disable" => disable_autostart(),
        "status" => autostart_status(),
        other => Err(format!("unknown autostart action {other:?}")),
    }
}

pub fn show_error(title: &str, message: &str) {
    let title = to_wide(title);
    let message = to_wide(message);
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR | 0x0001_0000 | 0x0004_0000,
        );
    }
}

struct WindowsCapture;

impl SelectionCapture for WindowsCapture {
    fn foreground_process(&mut self) -> Result<String, String> {
        foreground_process_name()
    }

    fn capture(&mut self) -> Result<String, String> {
        capture_selection()
    }
}

struct ShellLauncher;

impl BrowserLauncher for ShellLauncher {
    fn open(&mut self, url: &str) -> Result<(), String> {
        open_url(url)
    }
}

fn capture_selection() -> Result<String, String> {
    if !wait_for_modifiers_released(Duration::from_millis(750)) {
        logging::log("hotkey modifiers still held after 750ms; capturing anyway");
    }

    let (original, had_text) = read_clipboard_text()?;
    let result = (|| {
        let sentinel = new_sentinel();
        write_clipboard_text(&sentinel)?;
        let sentinel_sequence = clipboard_sequence();
        send_copy()?;

        let deadline = Instant::now() + Duration::from_millis(1200);
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(30));
            if clipboard_sequence() == sentinel_sequence {
                continue;
            }
            let (current, found) = read_clipboard_text()?;
            if !found || current.trim() == sentinel {
                continue;
            }
            return Ok(current);
        }
        Ok(String::new())
    })();

    if had_text {
        if let Err(err) = write_clipboard_text(&original) {
            logging::log(format!("restore clipboard: {err}"));
        }
    } else if let Err(err) = write_clipboard_text("") {
        logging::log(format!("clear clipboard: {err}"));
    }
    result
}

fn new_sentinel() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("funnel-intake-{nanos}")
}

fn with_clipboard<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let mut last = String::new();
    for _ in 0..12 {
        unsafe {
            if OpenClipboard(std::ptr::null_mut()) != 0 {
                let result = f();
                windows_sys::Win32::System::DataExchange::CloseClipboard();
                return result;
            }
        }
        last = last_error();
        std::thread::sleep(Duration::from_millis(15));
    }
    Err(format!("OpenClipboard: {last}"))
}

fn read_clipboard_text() -> Result<(String, bool), String> {
    with_clipboard(|| unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return Ok((String::new(), false));
        }
        let handle = GetClipboardData(CF_UNICODETEXT);
        if handle.is_null() {
            return Ok((String::new(), false));
        }
        let pointer = GlobalLock(handle);
        if pointer.is_null() {
            return Err(format!("GlobalLock: {}", last_error()));
        }
        let mut length = 0usize;
        let units = pointer as *const u16;
        while *units.add(length) != 0 && length < 1 << 24 {
            length += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(units, length));
        GlobalUnlock(handle);
        Ok((text, true))
    })
}

fn write_clipboard_text(text: &str) -> Result<(), String> {
    let text = text.replace('\0', "");
    let mut wide: Vec<u16> = text.encode_utf16().collect();
    wide.push(0);
    let size = wide.len() * 2;
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, size);
        if memory.is_null() {
            return Err(format!("GlobalAlloc: {}", last_error()));
        }
        let mut owned = true;
        let pointer = GlobalLock(memory);
        if pointer.is_null() {
            GlobalFree(memory);
            return Err(format!("GlobalLock: {}", last_error()));
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), pointer as *mut u16, wide.len());
        GlobalUnlock(memory);

        let result = with_clipboard(|| {
            windows_sys::Win32::System::DataExchange::EmptyClipboard();
            let result = SetClipboardData(CF_UNICODETEXT, memory);
            if result.is_null() {
                Err(format!("SetClipboardData: {}", last_error()))
            } else {
                Ok(())
            }
        });
        if result.is_ok() {
            owned = false;
        }
        if owned {
            GlobalFree(memory);
        }
        result
    }
}

fn clipboard_sequence() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

fn send_copy() -> Result<(), String> {
    unsafe {
        keybd_event(VK_CONTROL as u8, 0, 0, 0);
        keybd_event(VK_C as u8, 0, 0, 0);
        keybd_event(VK_C as u8, 0, KEYEVENTF_KEYUP, 0);
        keybd_event(VK_CONTROL as u8, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

fn wait_for_modifiers_released(timeout: Duration) -> bool {
    let keys = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN];
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let mut down = false;
        for key in keys {
            let state = unsafe { GetAsyncKeyState(key as i32) } as u16;
            if state & 0x8000 != 0 {
                down = true;
                break;
            }
        }
        if !down {
            return true;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    false
}

fn foreground_process_name() -> Result<String, String> {
    unsafe {
        let window: HWND = GetForegroundWindow();
        if window.is_null() {
            return Err("no foreground window".to_owned());
        }
        let mut process_id = 0u32;
        GetWindowThreadProcessId(window, &mut process_id);
        if process_id == 0 {
            return Err("foreground window has no process".to_owned());
        }
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id);
        if process.is_null() {
            return Err(format!("OpenProcess({process_id}): {}", last_error()));
        }
        let mut buffer = vec![0u16; 32768];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);
        if ok == 0 {
            return Err(format!("QueryFullProcessImageName: {}", last_error()));
        }
        let full = String::from_utf16_lossy(&buffer[..size as usize]);
        let name = Path::new(&full)
            .file_stem()
            .map(|name| name.to_string_lossy().to_lowercase())
            .unwrap_or_else(|| "unknown".to_owned());
        Ok(name)
    }
}

fn open_url(url: &str) -> Result<(), String> {
    let verb = to_wide("open");
    let file = to_wide(url);
    let result: HINSTANCE = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if (result as isize) > 32 {
        Ok(())
    } else {
        Err(format!("ShellExecute: {}", last_error()))
    }
}

fn enable_autostart() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|err| format!("current exe: {err}"))?;
    let command = format!("\"{}\" daemon", exe.display());
    let key_path = to_wide(AUTOSTART_KEY);
    let name = to_wide(AUTOSTART_NAME);
    let mut key: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            key_path.as_ptr(),
            0,
            std::ptr::null(),
            0,
            KEY_SET_VALUE,
            std::ptr::null(),
            &mut key,
            std::ptr::null_mut(),
        )
    };
    if status != 0 {
        return Err(format!("RegCreateKeyEx: {status}"));
    }
    let wide: Vec<u16> = command.encode_utf16().chain(std::iter::once(0)).collect();
    let status = unsafe {
        RegSetValueExW(
            key,
            name.as_ptr(),
            0,
            REG_SZ,
            wide.as_ptr() as *const u8,
            (wide.len() * 2) as u32,
        )
    };
    unsafe { RegCloseKey(key) };
    if status != 0 {
        return Err(format!("RegSetValueEx: {status}"));
    }
    Ok(format!("enabled: {command}"))
}

fn disable_autostart() -> Result<String, String> {
    let key_path = to_wide(AUTOSTART_KEY);
    let name = to_wide(AUTOSTART_NAME);
    let mut key: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            key_path.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut key,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok("disabled".to_owned());
    }
    if status != 0 {
        return Err(format!("RegOpenKeyEx: {status}"));
    }
    let status = unsafe { RegDeleteValueW(key, name.as_ptr()) };
    unsafe { RegCloseKey(key) };
    if status != 0 && status != ERROR_FILE_NOT_FOUND {
        return Err(format!("RegDeleteValue: {status}"));
    }
    Ok("disabled".to_owned())
}

fn autostart_status() -> Result<String, String> {
    let key_path = to_wide(AUTOSTART_KEY);
    let name = to_wide(AUTOSTART_NAME);
    let mut key: HKEY = std::ptr::null_mut();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            key_path.as_ptr(),
            0,
            KEY_QUERY_VALUE,
            &mut key,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        return Ok("disabled".to_owned());
    }
    if status != 0 {
        return Err(format!("RegOpenKeyEx: {status}"));
    }
    let mut kind = 0u32;
    let mut size = 0u32;
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            std::ptr::null(),
            &mut kind,
            std::ptr::null_mut(),
            &mut size,
        )
    };
    if status == ERROR_FILE_NOT_FOUND {
        unsafe { RegCloseKey(key) };
        return Ok("disabled".to_owned());
    }
    if status != 0 {
        unsafe { RegCloseKey(key) };
        return Err(format!("RegQueryValueEx: {status}"));
    }
    let mut data = vec![0u8; size as usize];
    let status = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            std::ptr::null(),
            &mut kind,
            data.as_mut_ptr(),
            &mut size,
        )
    };
    unsafe { RegCloseKey(key) };
    if status != 0 {
        return Err(format!("RegQueryValueEx: {status}"));
    }
    let wide: Vec<u16> = data
        .as_chunks::<2>()
        .0
        .iter()
        .map(|bytes| u16::from_le_bytes(*bytes))
        .take_while(|unit| *unit != 0)
        .collect();
    Ok(format!("enabled: {}", String::from_utf16_lossy(&wide)))
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn last_error() -> String {
    let code = unsafe { GetLastError() };
    std::io::Error::from_raw_os_error(code as i32).to_string()
}

fn funnel_icon() -> Vec<u8> {
    let mut pixels = vec![0u8; 16 * 16 * 4];
    for y in 0..16 {
        for x in 0..16 {
            let inside = (3..13).contains(&x) && (2..14).contains(&y);
            let funnel =
                inside && ((y < 5 && (3..13).contains(&x)) || (y >= 5 && (5..11).contains(&x)));
            let index = (y * 16 + x) * 4;
            if funnel {
                pixels[index] = 0x4c;
                pixels[index + 1] = 0x9a;
                pixels[index + 2] = 0xff;
                pixels[index + 3] = 0xff;
            }
        }
    }
    pixels
}
