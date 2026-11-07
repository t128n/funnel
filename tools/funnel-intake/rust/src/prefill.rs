//! Shared intake field limits, matching the web form and the existing helper.

const TITLE_MAX: usize = 256;
const BODY_MAX: usize = 65_536;
const SOURCE_MAX: usize = 128;

#[derive(Debug, PartialEq, Eq)]
pub struct Prefill {
    pub title: String,
    pub body: String,
    pub source: String,
}

fn clamp_utf16(value: &str, max: usize) -> &str {
    let mut units = 0;
    for (index, ch) in value.char_indices() {
        units += ch.len_utf16();
        if units > max {
            return &value[..index];
        }
    }
    value
}

pub fn build_prefill(selection: &str, source: &str) -> Prefill {
    let source = source.trim();
    let source = match source.to_ascii_lowercase().as_str() {
        "email" => "email",
        "chat" => "chat",
        "meeting" => "meeting",
        "walk-in" => "walk-in",
        "self-service" => "self-service",
        _ => source,
    };
    let title = selection
        .split(['\r', '\n'])
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .find(|line| !line.is_empty())
        .unwrap_or_default();
    Prefill {
        title: clamp_utf16(&title, TITLE_MAX).to_owned(),
        body: if selection.trim().is_empty() {
            String::new()
        } else {
            clamp_utf16(selection, BODY_MAX).to_owned()
        },
        source: clamp_utf16(source, SOURCE_MAX).to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_to_prefill() {
        assert_eq!(
            build_prefill(" \n  hello   world\nNext", " CHAT "),
            Prefill {
                title: "hello world".into(),
                body: " \n  hello   world\nNext".into(),
                source: "chat".into(),
            }
        );
        assert_eq!(build_prefill("  \n", "custom").body, "");
    }

    #[test]
    fn utf16_limit_does_not_split_surrogates() {
        assert_eq!(clamp_utf16("a😀b", 2), "a");
        assert_eq!(clamp_utf16("a😀b", 3), "a😀");
    }
}
