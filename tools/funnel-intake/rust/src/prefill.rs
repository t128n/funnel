//! Shared intake field limits, matching the web form and the original helper.

use std::collections::BTreeMap;

pub const TITLE_MAX: usize = 256;
pub const BODY_MAX: usize = 65_536;
pub const SOURCE_MAX: usize = 128;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Prefill {
    pub title: String,
    pub body: String,
    pub source: String,
}

pub fn build_prefill(selection: &str, source: &str) -> Prefill {
    let source = clamp_utf16(&normalize_source(source), SOURCE_MAX).to_owned();
    if selection.trim().is_empty() {
        return Prefill {
            source,
            ..Prefill::default()
        };
    }

    let title = first_line(selection);
    Prefill {
        title: clamp_utf16(&title, TITLE_MAX).to_owned(),
        body: clamp_utf16(selection, BODY_MAX).to_owned(),
        source,
    }
}

pub fn clamp_prefill(prefill: Prefill) -> Prefill {
    Prefill {
        title: clamp_utf16(prefill.title.trim(), TITLE_MAX).to_owned(),
        body: clamp_utf16(&prefill.body, BODY_MAX).to_owned(),
        source: clamp_utf16(&normalize_source(&prefill.source), SOURCE_MAX).to_owned(),
    }
}

pub fn source_for_process(process: &str, source_map: &BTreeMap<String, String>) -> String {
    let key = normalize_process_name(process);
    if key.is_empty() {
        return "unknown".to_owned();
    }
    if let Some(value) = source_map.get(&key) {
        return normalize_source(value);
    }
    if let Some(value) = builtin_source_map().get(key.as_str()) {
        return normalize_source(value);
    }
    normalize_source(&key)
}

pub fn normalize_process_name(process: &str) -> String {
    let name = process.trim().to_lowercase();
    name.strip_suffix(".exe").unwrap_or(&name).to_owned()
}

pub fn normalize_source(raw: &str) -> String {
    let value = raw.trim();
    if value.is_empty() {
        return String::new();
    }
    match value.to_lowercase().as_str() {
        "email" => "email".to_owned(),
        "chat" => "chat".to_owned(),
        "meeting" => "meeting".to_owned(),
        "walk-in" => "walk-in".to_owned(),
        "self-service" => "self-service".to_owned(),
        _ => value.to_owned(),
    }
}

pub fn first_line(text: &str) -> String {
    text.split(['\r', '\n'])
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .find(|line| !line.is_empty())
        .unwrap_or_default()
}

/// Truncates `value` to at most `max` UTF-16 code units without splitting a
/// surrogate pair.
pub fn clamp_utf16(value: &str, max: usize) -> &str {
    if max == 0 {
        return "";
    }
    let mut units = 0;
    for (index, ch) in value.char_indices() {
        units += ch.len_utf16();
        if units > max {
            return &value[..index];
        }
    }
    value
}

pub fn truncate_utf16(value: &str, max: usize) -> &str {
    clamp_utf16(value, max)
}

pub fn utf16_length(value: &str) -> usize {
    value.chars().map(char::len_utf16).sum()
}

fn builtin_source_map() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("ms-teams", "chat"),
        ("teams", "chat"),
        ("msteams", "chat"),
        ("microsoft teams", "chat"),
        ("slack", "chat"),
        ("discord", "chat"),
        ("outlook", "email"),
        ("microsoft outlook", "email"),
        ("thunderbird", "email"),
        ("zoom", "meeting"),
        ("zoom.us", "meeting"),
        ("webex", "meeting"),
        ("cisco webex", "meeting"),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_to_prefill() {
        let selection = "   \r\n  Fix the login   flow  \r\nsecond line\nthird";
        let prefill = build_prefill(selection, "chat");
        assert_eq!(prefill.title, "Fix the login flow");
        assert_eq!(prefill.body, selection);
        assert_eq!(prefill.source, "chat");
    }

    #[test]
    fn empty_selection() {
        let prefill = build_prefill("   \n\t ", "email");
        assert_eq!(prefill.title, "");
        assert_eq!(prefill.body, "");
        assert_eq!(prefill.source, "email");
    }

    #[test]
    fn strips_leading_blank_lines() {
        assert_eq!(
            build_prefill("\n\n   \nactual text", "unknown").title,
            "actual text"
        );
    }

    #[test]
    fn utf16_limit_does_not_split_surrogates() {
        assert_eq!(clamp_utf16("a😀b", 1), "a");
        assert_eq!(clamp_utf16("a😀b", 2), "a");
        assert_eq!(clamp_utf16("a😀b", 3), "a😀");
        assert_eq!(utf16_length("a😀b"), 4);
    }

    #[test]
    fn clamp_prefill_limits() {
        let prefill = clamp_prefill(Prefill {
            title: "t".repeat(TITLE_MAX + 10),
            body: "a".repeat(BODY_MAX + 10),
            source: "s".repeat(SOURCE_MAX + 10),
        });
        assert_eq!(prefill.title.len(), TITLE_MAX);
        assert_eq!(prefill.body.len(), BODY_MAX);
        assert_eq!(prefill.source.len(), SOURCE_MAX);
    }

    #[test]
    fn source_for_process_uses_overrides_then_builtins() {
        let overrides = BTreeMap::from([("msedge".to_owned(), "walk-in".to_owned())]);
        let cases = [
            ("ms-teams", "chat"),
            ("Teams.exe", "chat"),
            ("OUTLOOK.EXE", "email"),
            ("Zoom", "meeting"),
            ("msedge.exe", "walk-in"),
            ("slack", "chat"),
            ("notepad", "notepad"),
            ("", "unknown"),
        ];
        for (process, want) in cases {
            assert_eq!(source_for_process(process, &overrides), want);
        }
    }

    #[test]
    fn normalize_source_matches_known_values() {
        assert_eq!(normalize_source("  Email "), "email");
        assert_eq!(normalize_source("CHAT"), "chat");
        assert_eq!(normalize_source("Meeting"), "meeting");
        assert_eq!(normalize_source("walk-in"), "walk-in");
        assert_eq!(normalize_source("self-service"), "self-service");
        assert_eq!(normalize_source("Slack"), "Slack");
        assert_eq!(normalize_source(""), "");
    }
}
