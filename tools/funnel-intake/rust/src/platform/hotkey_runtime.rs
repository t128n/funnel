//! Shared global-hotkey runtime for Windows and macOS.

use global_hotkey::hotkey::{Code, HotKey, Modifiers as GlobalModifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};

use crate::hotkey::{Hotkey, Key, Modifiers};

pub struct Runtime {
    manager: GlobalHotKeyManager,
    current: Option<HotKey>,
}

impl Runtime {
    pub fn new() -> Result<Self, String> {
        let manager =
            GlobalHotKeyManager::new().map_err(|err| format!("global hotkey manager: {err}"))?;
        Ok(Runtime {
            manager,
            current: None,
        })
    }

    pub fn register(&mut self, hotkey: &Hotkey) -> Result<(), String> {
        let hotkey_global = to_global(hotkey);
        self.manager
            .register(hotkey_global)
            .map_err(|err| format!("register {hotkey}: {err}"))?;
        self.current = Some(hotkey_global);
        Ok(())
    }

    pub fn unregister(&mut self, _hotkey: &Hotkey) -> Result<(), String> {
        if let Some(current) = self.current.take() {
            self.manager
                .unregister(current)
                .map_err(|err| format!("unregister {current}: {err}"))?;
        }
        Ok(())
    }

    pub fn pump(&mut self) {
        super::native::pump_events();
    }

    pub fn take_press(&mut self) -> bool {
        let Some(current) = self.current else {
            return false;
        };
        while let Ok(event) = GlobalHotKeyEvent::receiver().try_recv() {
            if event.id() == current.id() && event.state() == HotKeyState::Pressed {
                return true;
            }
        }
        false
    }
}

fn to_global(hotkey: &Hotkey) -> HotKey {
    let mut modifiers = GlobalModifiers::empty();
    if hotkey.modifiers().contains(Modifiers::ALT) {
        modifiers |= GlobalModifiers::ALT;
    }
    if hotkey.modifiers().contains(Modifiers::CONTROL) {
        modifiers |= GlobalModifiers::CONTROL;
    }
    if hotkey.modifiers().contains(Modifiers::SHIFT) {
        modifiers |= GlobalModifiers::SHIFT;
    }
    if hotkey.modifiers().contains(Modifiers::META) {
        modifiers |= GlobalModifiers::META;
    }
    HotKey::new(Some(modifiers), to_code(hotkey.key()))
}

fn to_code(key: &Key) -> Code {
    match key {
        Key::Letter(ch) => match ch {
            'A' => Code::KeyA,
            'B' => Code::KeyB,
            'C' => Code::KeyC,
            'D' => Code::KeyD,
            'E' => Code::KeyE,
            'F' => Code::KeyF,
            'G' => Code::KeyG,
            'H' => Code::KeyH,
            'I' => Code::KeyI,
            'J' => Code::KeyJ,
            'K' => Code::KeyK,
            'L' => Code::KeyL,
            'M' => Code::KeyM,
            'N' => Code::KeyN,
            'O' => Code::KeyO,
            'P' => Code::KeyP,
            'Q' => Code::KeyQ,
            'R' => Code::KeyR,
            'S' => Code::KeyS,
            'T' => Code::KeyT,
            'U' => Code::KeyU,
            'V' => Code::KeyV,
            'W' => Code::KeyW,
            'X' => Code::KeyX,
            'Y' => Code::KeyY,
            _ => Code::KeyZ,
        },
        Key::Digit(ch) => match ch {
            '0' => Code::Digit0,
            '1' => Code::Digit1,
            '2' => Code::Digit2,
            '3' => Code::Digit3,
            '4' => Code::Digit4,
            '5' => Code::Digit5,
            '6' => Code::Digit6,
            '7' => Code::Digit7,
            '8' => Code::Digit8,
            _ => Code::Digit9,
        },
        Key::Function(n) => match n {
            1 => Code::F1,
            2 => Code::F2,
            3 => Code::F3,
            4 => Code::F4,
            5 => Code::F5,
            6 => Code::F6,
            7 => Code::F7,
            8 => Code::F8,
            9 => Code::F9,
            10 => Code::F10,
            11 => Code::F11,
            12 => Code::F12,
            13 => Code::F13,
            14 => Code::F14,
            15 => Code::F15,
            16 => Code::F16,
            17 => Code::F17,
            18 => Code::F18,
            19 => Code::F19,
            20 => Code::F20,
            21 => Code::F21,
            22 => Code::F22,
            23 => Code::F23,
            _ => Code::F24,
        },
        Key::NumpadDigit(n) => match n {
            0 => Code::Numpad0,
            1 => Code::Numpad1,
            2 => Code::Numpad2,
            3 => Code::Numpad3,
            4 => Code::Numpad4,
            5 => Code::Numpad5,
            6 => Code::Numpad6,
            7 => Code::Numpad7,
            8 => Code::Numpad8,
            _ => Code::Numpad9,
        },
        Key::Backspace => Code::Backspace,
        Key::Tab => Code::Tab,
        Key::Enter => Code::Enter,
        Key::Pause => Code::Pause,
        Key::Escape => Code::Escape,
        Key::Space => Code::Space,
        Key::PageUp => Code::PageUp,
        Key::PageDown => Code::PageDown,
        Key::End => Code::End,
        Key::Home => Code::Home,
        Key::Left => Code::ArrowLeft,
        Key::Up => Code::ArrowUp,
        Key::Right => Code::ArrowRight,
        Key::Down => Code::ArrowDown,
        Key::PrintScreen => Code::PrintScreen,
        Key::Insert => Code::Insert,
        Key::Delete => Code::Delete,
        Key::Plus | Key::Equal => Code::Equal,
        Key::Minus => Code::Minus,
        Key::Comma => Code::Comma,
        Key::Period => Code::Period,
        Key::Slash => Code::Slash,
        Key::Backslash => Code::Backslash,
        Key::Semicolon => Code::Semicolon,
        Key::Quote => Code::Quote,
        Key::Backtick => Code::Backquote,
        Key::BracketLeft => Code::BracketLeft,
        Key::BracketRight => Code::BracketRight,
        Key::NumpadAdd => Code::NumpadAdd,
        Key::NumpadSubtract => Code::NumpadSubtract,
        Key::NumpadMultiply => Code::NumpadMultiply,
        Key::NumpadDivide => Code::NumpadDivide,
        Key::NumpadDecimal => Code::NumpadDecimal,
    }
}
