//! Rune settings/status window.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use rune::tok::{self, radius, space, type_};
use rune::{AppSpec, Cx, El, TextEdit, Tx, col, el, row, text, text_input};

use crate::config::{Config, default_config_path, load_file_config, save_config};
use crate::hotkey::Hotkey;
use crate::prefill::normalize_source;

static SETTINGS_PATH: OnceLock<PathBuf> = OnceLock::new();

struct State {
    config_path: PathBuf,
    url: TextEdit,
    hotkey: TextEdit,
    source: TextEdit,
    source_map: TextEdit,
    message: String,
    error: String,
    daemon_running: bool,
    last_status_check: f64,
}

impl State {
    fn load(path: PathBuf) -> Self {
        let config = load_file_config(&path).unwrap_or_else(|_| Config::default());
        let source_map =
            serde_json::to_string_pretty(&config.source_map).unwrap_or_else(|_| "{}".to_owned());
        State {
            config_path: path,
            url: TextEdit::new(config.base_url.clone()),
            hotkey: TextEdit::new(config.hotkey.clone()),
            source: TextEdit::new(config.source.clone()),
            source_map: TextEdit::new(source_map),
            message: String::new(),
            error: String::new(),
            daemon_running: false,
            last_status_check: f64::NEG_INFINITY,
        }
    }
}

impl Default for State {
    fn default() -> Self {
        State::load(
            SETTINGS_PATH
                .get()
                .cloned()
                .unwrap_or_else(default_config_path),
        )
    }
}

pub fn run(options: &crate::cli::Options) -> Result<(), String> {
    let _ = SETTINGS_PATH.set(options.config_path.clone());
    rune::run(AppSpec {
        poll: Some(poll),
        ..AppSpec::new("Funnel Intake", (640.0, 660.0), State::default, view)
    });
    Ok(())
}

fn poll(state: &mut State, elapsed: f64, _tx: &mut Tx) -> bool {
    if elapsed - state.last_status_check < 1.0 {
        return false;
    }
    state.last_status_check = elapsed;
    let running = crate::daemon::daemon_running(&state.config_path);
    if running != state.daemon_running {
        state.daemon_running = running;
        true
    } else {
        false
    }
}

fn view(state: &State, cx: &mut Cx<State>) -> El {
    let dark = cx.system_dark();
    let t = tok::theme(dark);
    let error_color = tok::accent(2, dark);
    let ok_color = tok::accent(4, dark);
    let validation = validate_fields(&state.url.text, &state.hotkey.text, &state.source_map.text);

    let status = row()
        .key("daemon-status")
        .gap(space::S2)
        .center_y()
        .child(
            el().size(9.0, 9.0)
                .radius(5.0)
                .fill(if state.daemon_running {
                    ok_color
                } else {
                    t.control_off
                }),
        )
        .child(
            text(if state.daemon_running {
                "Daemon running"
            } else {
                "Daemon stopped"
            })
            .key("status-text")
            .font(type_::LABEL)
            .color(t.text_secondary),
        );

    let header = row()
        .w_full()
        .center_y()
        .child(
            col()
                .gap(2.0)
                .grow(1.0)
                .child(
                    text("Funnel Intake")
                        .key("title")
                        .font(type_::TITLE)
                        .color(t.text),
                )
                .child(
                    text("Global shortcut, capture and browser settings.")
                        .key("subtitle")
                        .font(type_::BODY)
                        .color(t.text_secondary),
                ),
        )
        .child(status);

    let url_field = field(
        "url",
        "Funnel URL",
        text_input(&state.url, type_::BODY)
            .key("url")
            .single_line()
            .w_full()
            .h(34.0)
            .padding(space::S2)
            .radius(radius::MD)
            .fill(t.card)
            .border(1.0, t.card_border)
            .color(t.text)
            .placeholder("http://localhost:3000", t.text_secondary)
            .on_edit(|s: &mut State| &mut s.url),
        "The helper appends /intake. Query strings and fragments are rejected.",
        t,
        None,
    );

    let hotkey_help = match Hotkey::parse(&state.hotkey.text) {
        Ok(hotkey) => format!(
            "Parsed as {}. Alt/Opt/Option are aliases; the default is {}.",
            hotkey,
            crate::config::default_hotkey()
        ),
        Err(err) => err,
    };
    let hotkey_field = field(
        "hotkey",
        "Shortcut",
        text_input(&state.hotkey, type_::BODY)
            .key("hotkey")
            .single_line()
            .w_full()
            .h(34.0)
            .padding(space::S2)
            .radius(radius::MD)
            .fill(t.card)
            .border(1.0, t.card_border)
            .color(t.text)
            .placeholder(crate::config::default_hotkey(), t.text_secondary)
            .on_edit(|s: &mut State| &mut s.hotkey),
        &hotkey_help,
        t,
        None,
    );

    let source_field = field(
        "source",
        "Fixed source (optional)",
        text_input(&state.source, type_::BODY)
            .key("source")
            .single_line()
            .w_full()
            .h(34.0)
            .padding(space::S2)
            .radius(radius::MD)
            .fill(t.card)
            .border(1.0, t.card_border)
            .color(t.text)
            .placeholder("Detect from the foreground app", t.text_secondary)
            .on_edit(|s: &mut State| &mut s.source),
        "Leave empty to detect the source from the foreground app.",
        t,
        None,
    );

    let map_field = field(
        "sourceMap",
        "Source map (JSON)",
        text_input(&state.source_map, type_::MONO_CAPTION)
            .key("sourceMap")
            .w_full()
            .min_h(110.0)
            .padding(space::S2)
            .radius(radius::MD)
            .fill(t.card)
            .border(1.0, t.card_border)
            .color(t.text)
            .on_edit(|s: &mut State| &mut s.source_map),
        "Process name to source, for example {\"slack\": \"chat\"}.",
        t,
        None,
    );

    let feedback = if !state.error.is_empty() {
        Some(
            text(state.error.clone())
                .key("error")
                .font(type_::LABEL)
                .color(error_color),
        )
    } else if !state.message.is_empty() {
        Some(
            text(state.message.clone())
                .key("message")
                .font(type_::LABEL)
                .color(ok_color),
        )
    } else {
        None
    };

    let save_button =
        button("save", "Save", tok::accent(0, dark), t.text, t).on_press(|s: &mut State| {
            match save_state(s) {
                Ok(()) => {
                    s.error.clear();
                    s.message = format!("Saved {}", s.config_path.display());
                }
                Err(err) => {
                    s.message.clear();
                    s.error = err;
                }
            }
        });

    let start_button = if state.daemon_running {
        button(
            "start",
            "Daemon running",
            t.control_off,
            t.text_secondary,
            t,
        )
        .disabled(true)
    } else {
        button("start", "Start daemon", t.control_off, t.text, t).on_press(|s: &mut State| {
            let Ok(exe) = std::env::current_exe() else {
                s.error = "Cannot find the executable".to_owned();
                return;
            };
            match Command::new(exe)
                .arg("daemon")
                .arg("--config")
                .arg(&s.config_path)
                .spawn()
            {
                Ok(_) => {
                    s.error.clear();
                    s.message = "Starting the daemon…".to_owned();
                }
                Err(err) => s.error = format!("Start daemon: {err}"),
            }
        })
    };

    let quit_button = button("quit", "Quit", t.control_off, t.text_secondary, t)
        .on_press_tx(|_: &mut State, tx: &mut Tx| tx.quit());

    let validation_line = match validation {
        Err(err) => Some(
            text(err)
                .key("validation")
                .font(type_::LABEL)
                .color(error_color),
        ),
        Ok(()) => None,
    };

    let mut body = col()
        .key("body")
        .w_full()
        .h_full()
        .fill(t.bg)
        .px(space::S6)
        .py(space::S6)
        .gap(space::S3)
        .child(header)
        .child(
            col()
                .w_full()
                .gap(space::S3)
                .padding(space::S6)
                .radius(radius::LG)
                .fill(t.card)
                .border(1.0, t.card_border)
                .child(url_field)
                .child(hotkey_field)
                .child(source_field)
                .child(map_field),
        )
        .child(
            row()
                .w_full()
                .gap(space::S2)
                .child(save_button)
                .child(start_button)
                .child(el().grow(1.0))
                .child(quit_button),
        );

    if let Some(feedback) = feedback {
        body = body.child(feedback);
    }
    if let Some(line) = validation_line {
        body = body.child(line);
    }
    body
}

fn field(
    key: &'static str,
    label: &'static str,
    input: El,
    help: &str,
    theme: tok::Theme,
    error: Option<&str>,
) -> El {
    let help_color = if error.is_some() {
        tok::accent(2, true)
    } else {
        theme.text_secondary
    };
    col()
        .key(format!("field-{key}"))
        .w_full()
        .gap(space::S1)
        .child(text(label).font(type_::LABEL).color(theme.text))
        .child(input)
        .child(
            text(error.unwrap_or(help).to_owned())
                .font(type_::LABEL)
                .color(help_color),
        )
}

fn button(
    key: &'static str,
    label: &'static str,
    fill: rune::Color,
    color: rune::Color,
    _theme: tok::Theme,
) -> El {
    el().key(key)
        .h(34.0)
        .px(space::S3)
        .center()
        .radius(radius::MD)
        .fill(fill)
        .focusable(true)
        .child(text(label).font(type_::LABEL).color(color))
}

fn validate_fields(url: &str, hotkey: &str, source_map: &str) -> Result<(), String> {
    config_from_fields(url, hotkey, "", source_map).map(|_| ())
}

pub fn config_from_fields(
    url: &str,
    hotkey: &str,
    source: &str,
    source_map: &str,
) -> Result<Config, String> {
    let map = if source_map.trim().is_empty() {
        BTreeMap::new()
    } else {
        serde_json::from_str::<BTreeMap<String, String>>(source_map)
            .map_err(|err| format!("Source map is not valid JSON: {err}"))?
    };
    let mut config = Config {
        base_url: url.trim().to_owned(),
        hotkey: hotkey.trim().to_owned(),
        source: normalize_source(source),
        source_map: map,
    };
    config.normalize()?;
    Ok(config)
}

fn save_state(state: &mut State) -> Result<(), String> {
    let config = config_from_fields(
        &state.url.text,
        &state.hotkey.text,
        &state.source.text,
        &state.source_map.text,
    )?;
    save_config(&state.config_path, &config)
}

/// Opens the settings window for a config path; used by the daemon's tray.
pub fn open(config_path: &Path) -> Result<(), String> {
    let mut command =
        Command::new(std::env::current_exe().map_err(|err| format!("current exe: {err}"))?);
    command.arg("settings").arg("--config").arg(config_path);
    command
        .spawn()
        .map(|_| ())
        .map_err(|err| format!("open settings: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_fields() {
        let config = config_from_fields(
            "https://funnel.example.com/funnel/",
            "Option+F",
            "chat",
            r#"{"slack":"meeting"}"#,
        )
        .unwrap();
        assert_eq!(config.base_url, "https://funnel.example.com/funnel");
        assert_eq!(
            config.source_map.get("slack").map(String::as_str),
            Some("meeting")
        );
    }

    #[test]
    fn rejects_invalid_hotkey_and_url() {
        assert!(config_from_fields("https://example.com", "NotAKey", "", "{}").is_err());
        assert!(config_from_fields("ftp://example.com", "Alt+F", "", "{}").is_err());
        assert!(config_from_fields("https://example.com?a=1", "Alt+F", "", "{}").is_err());
    }

    #[test]
    fn rejects_malformed_source_map() {
        assert!(config_from_fields("https://example.com", "Alt+F", "", "{nope").is_err());
        assert!(config_from_fields("https://example.com", "Alt+F", "", "[1,2]").is_err());
    }

    #[test]
    fn empty_source_map_is_allowed() {
        assert!(config_from_fields("https://example.com", "Alt+F", "", "").is_ok());
    }
}
