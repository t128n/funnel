//! Global hotkey parsing shared by every platform.
//!
//! The parser accepts the same syntax as the original helper plus the macOS
//! spellings: `Alt`, `Opt`, `Option`, `Ctrl`/`Control`, `Shift`, and
//! `Win`/`Windows`/`Meta`/`Super`/`Cmd`/`Command`.

use std::fmt;
use std::ops::{BitOr, BitOrAssign};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Modifiers(u8);

impl Modifiers {
    pub const ALT: Modifiers = Modifiers(0b0001);
    pub const CONTROL: Modifiers = Modifiers(0b0010);
    pub const SHIFT: Modifiers = Modifiers(0b0100);
    pub const META: Modifiers = Modifiers(0b1000);

    pub fn contains(self, other: Modifiers) -> bool {
        self.0 & other.0 == other.0
    }

    pub fn is_empty(self) -> bool {
        self.0 == 0
    }
}

impl BitOr for Modifiers {
    type Output = Modifiers;

    fn bitor(self, rhs: Modifiers) -> Modifiers {
        Modifiers(self.0 | rhs.0)
    }
}

impl BitOrAssign for Modifiers {
    fn bitor_assign(&mut self, rhs: Modifiers) {
        self.0 |= rhs.0;
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Key {
    Letter(char),
    Digit(char),
    Function(u8),
    NumpadDigit(u8),
    Backspace,
    Tab,
    Enter,
    Pause,
    Escape,
    Space,
    PageUp,
    PageDown,
    End,
    Home,
    Left,
    Up,
    Right,
    Down,
    PrintScreen,
    Insert,
    Delete,
    Plus,
    Equal,
    Minus,
    Comma,
    Period,
    Slash,
    Backslash,
    Semicolon,
    Quote,
    Backtick,
    BracketLeft,
    BracketRight,
    NumpadAdd,
    NumpadSubtract,
    NumpadMultiply,
    NumpadDivide,
    NumpadDecimal,
}

impl fmt::Display for Key {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Key::Letter(c) | Key::Digit(c) => write!(f, "{c}"),
            Key::Function(n) => write!(f, "F{n}"),
            Key::NumpadDigit(n) => write!(f, "Numpad{n}"),
            Key::Backspace => f.write_str("Backspace"),
            Key::Tab => f.write_str("Tab"),
            Key::Enter => f.write_str("Enter"),
            Key::Pause => f.write_str("Pause"),
            Key::Escape => f.write_str("Esc"),
            Key::Space => f.write_str("Space"),
            Key::PageUp => f.write_str("PageUp"),
            Key::PageDown => f.write_str("PageDown"),
            Key::End => f.write_str("End"),
            Key::Home => f.write_str("Home"),
            Key::Left => f.write_str("Left"),
            Key::Up => f.write_str("Up"),
            Key::Right => f.write_str("Right"),
            Key::Down => f.write_str("Down"),
            Key::PrintScreen => f.write_str("PrintScreen"),
            Key::Insert => f.write_str("Insert"),
            Key::Delete => f.write_str("Delete"),
            Key::Plus => f.write_str("Plus"),
            Key::Equal => f.write_str("Equal"),
            Key::Minus => f.write_str("Minus"),
            Key::Comma => f.write_str("Comma"),
            Key::Period => f.write_str("Period"),
            Key::Slash => f.write_str("Slash"),
            Key::Backslash => f.write_str("Backslash"),
            Key::Semicolon => f.write_str("Semicolon"),
            Key::Quote => f.write_str("Quote"),
            Key::Backtick => f.write_str("Backtick"),
            Key::BracketLeft => f.write_str("BracketLeft"),
            Key::BracketRight => f.write_str("BracketRight"),
            Key::NumpadAdd => f.write_str("NumpadAdd"),
            Key::NumpadSubtract => f.write_str("NumpadSubtract"),
            Key::NumpadMultiply => f.write_str("NumpadMultiply"),
            Key::NumpadDivide => f.write_str("NumpadDivide"),
            Key::NumpadDecimal => f.write_str("NumpadDecimal"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Hotkey {
    modifiers: Modifiers,
    key: Key,
}

impl Hotkey {
    pub fn parse(input: &str) -> Result<Hotkey, String> {
        let raw = input.trim();
        if raw.is_empty() {
            return Err("hotkey is empty".to_owned());
        }

        let parts: Vec<&str> = raw.split('+').collect();
        if parts.len() < 2 {
            return Err(format!(
                "hotkey {input:?} needs a modifier (for example Ctrl+Alt+I)"
            ));
        }

        let mut modifiers = Modifiers::default();
        let mut key = None;
        let mut seen = Vec::new();

        for part in parts {
            let token = part.trim();
            if token.is_empty() {
                return Err(format!("hotkey {input:?} contains an empty part"));
            }
            if let Some(modifier) = parse_modifier(token) {
                if seen.contains(&modifier) {
                    return Err(format!("hotkey {input:?} repeats modifier {token}"));
                }
                seen.push(modifier);
                modifiers |= modifier;
                continue;
            }
            if key.is_some() {
                return Err(format!("hotkey {input:?} contains more than one key"));
            }
            key = Some(parse_key(token).map_err(|err| format!("hotkey {input:?}: {err}"))?);
        }

        if modifiers.is_empty() {
            return Err(format!(
                "hotkey {input:?} needs a modifier (for example Ctrl+Alt+I)"
            ));
        }
        let key = key.ok_or_else(|| format!("hotkey {input:?} has no key"))?;
        Ok(Hotkey { modifiers, key })
    }

    pub fn modifiers(&self) -> Modifiers {
        self.modifiers
    }

    pub fn key(&self) -> &Key {
        &self.key
    }

    pub fn canonical(&self) -> String {
        let mut parts = Vec::new();
        if self.modifiers.contains(Modifiers::CONTROL) {
            parts.push("Ctrl".to_owned());
        }
        if self.modifiers.contains(Modifiers::ALT) {
            parts.push("Alt".to_owned());
        }
        if self.modifiers.contains(Modifiers::SHIFT) {
            parts.push("Shift".to_owned());
        }
        if self.modifiers.contains(Modifiers::META) {
            parts.push("Win".to_owned());
        }
        parts.push(self.key.to_string());
        parts.join("+")
    }
}

impl fmt::Display for Hotkey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.canonical())
    }
}

fn parse_modifier(token: &str) -> Option<Modifiers> {
    match token.to_lowercase().as_str() {
        "ctrl" | "control" => Some(Modifiers::CONTROL),
        "alt" | "opt" | "option" => Some(Modifiers::ALT),
        "shift" => Some(Modifiers::SHIFT),
        "win" | "windows" | "meta" | "super" | "cmd" | "command" => Some(Modifiers::META),
        _ => None,
    }
}

fn parse_key(token: &str) -> Result<Key, String> {
    let upper = token.to_uppercase();

    let named = match upper.as_str() {
        "BACKSPACE" => Some(Key::Backspace),
        "TAB" => Some(Key::Tab),
        "ENTER" | "RETURN" => Some(Key::Enter),
        "PAUSE" | "BREAK" => Some(Key::Pause),
        "ESC" | "ESCAPE" => Some(Key::Escape),
        "SPACE" => Some(Key::Space),
        "PAGEUP" | "PGUP" => Some(Key::PageUp),
        "PAGEDOWN" | "PGDN" => Some(Key::PageDown),
        "END" => Some(Key::End),
        "HOME" => Some(Key::Home),
        "LEFT" => Some(Key::Left),
        "UP" => Some(Key::Up),
        "RIGHT" => Some(Key::Right),
        "DOWN" => Some(Key::Down),
        "PRINTSCREEN" | "PRTSC" => Some(Key::PrintScreen),
        "INSERT" | "INS" => Some(Key::Insert),
        "DELETE" | "DEL" => Some(Key::Delete),
        "PLUS" => Some(Key::Plus),
        "EQUAL" => Some(Key::Equal),
        "MINUS" => Some(Key::Minus),
        "COMMA" => Some(Key::Comma),
        "PERIOD" => Some(Key::Period),
        "SLASH" => Some(Key::Slash),
        "BACKSLASH" => Some(Key::Backslash),
        "SEMICOLON" => Some(Key::Semicolon),
        "QUOTE" => Some(Key::Quote),
        "BACKTICK" | "GRAVE" => Some(Key::Backtick),
        "BRACKETLEFT" => Some(Key::BracketLeft),
        "BRACKETRIGHT" => Some(Key::BracketRight),
        _ => None,
    };
    if let Some(key) = named {
        return Ok(key);
    }

    let mut chars = token.chars();
    if let (Some(ch), None) = (chars.next(), chars.next()) {
        let ch = ch.to_ascii_uppercase();
        if ch.is_ascii_alphabetic() {
            return Ok(Key::Letter(ch));
        }
        if ch.is_ascii_digit() {
            return Ok(Key::Digit(ch));
        }
    }

    if let Some(rest) = upper.strip_prefix("NUMPAD") {
        if let Ok(n) = rest.parse::<u8>()
            && n <= 9
        {
            return Ok(Key::NumpadDigit(n));
        }
        match rest {
            "ADD" | "PLUS" => return Ok(Key::NumpadAdd),
            "SUBTRACT" | "MINUS" => return Ok(Key::NumpadSubtract),
            "MULTIPLY" => return Ok(Key::NumpadMultiply),
            "DIVIDE" => return Ok(Key::NumpadDivide),
            "DECIMAL" | "PERIOD" => return Ok(Key::NumpadDecimal),
            _ => {}
        }
    }

    if let Some(number) = upper.strip_prefix('F')
        && let Ok(n) = number.parse::<u8>()
        && (1..=24).contains(&n)
    {
        return Ok(Key::Function(n));
    }

    Err(format!("unsupported key {token:?}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_hotkeys() {
        let cases = [
            ("Ctrl+Alt+I", "Ctrl+Alt+I"),
            ("ctrl+shift+f12", "Ctrl+Shift+F12"),
            ("Win+Space", "Win+Space"),
            ("Alt+F4", "Alt+F4"),
            ("Ctrl+Alt+Plus", "Ctrl+Alt+Plus"),
            ("Shift+Ctrl+Enter", "Ctrl+Shift+Enter"),
            (" meta + alt + 7 ", "Alt+Win+7"),
            ("Ctrl+Alt+Numpad5", "Ctrl+Alt+Numpad5"),
        ];
        for (input, canonical) in cases {
            let hotkey = Hotkey::parse(input).unwrap_or_else(|err| panic!("{input}: {err}"));
            assert_eq!(hotkey.canonical(), canonical);
        }
    }

    #[test]
    fn macos_aliases_map_to_alt() {
        for input in ["Opt+F", "Option+F", "ALT+F", "alt+f"] {
            let hotkey = Hotkey::parse(input).unwrap();
            assert!(hotkey.modifiers().contains(Modifiers::ALT));
            assert_eq!(hotkey.key(), &Key::Letter('F'));
            assert_eq!(hotkey.canonical(), "Alt+F");
        }
        let hotkey = Hotkey::parse("Cmd+Shift+Space").unwrap();
        assert!(hotkey.modifiers().contains(Modifiers::META));
        assert!(hotkey.modifiers().contains(Modifiers::SHIFT));
        assert_eq!(hotkey.canonical(), "Shift+Win+Space");
    }

    #[test]
    fn invalid_hotkeys() {
        for input in [
            "",
            "I",
            "Ctrl",
            "Ctrl+I+J",
            "Ctrl+Ctrl+I",
            "Ctrl++",
            "Ctrl+Unknown",
            "Ctrl+F25",
            "Ctrl+",
        ] {
            assert!(Hotkey::parse(input).is_err(), "{input:?} should fail");
        }
    }

    #[test]
    fn modifier_duplicate_is_rejected_case_insensitively() {
        assert!(Hotkey::parse("Alt+OPTION+F").is_err());
    }
}
