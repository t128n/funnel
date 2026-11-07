//! Config file and environment handling, matching the original helper's
//! `%LOCALAPPDATA%\Funnel\Intake\config.json` contract.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use url::Url;

use crate::hotkey::Hotkey;
use crate::prefill::{normalize_process_name, normalize_source};

pub const DEFAULT_BASE_URL: &str = "http://localhost:3000";

pub fn default_hotkey() -> &'static str {
    if cfg!(target_os = "macos") {
        "Option+F"
    } else {
        "Alt+F"
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub base_url: String,
    pub hotkey: String,
    pub source: String,
    pub source_map: BTreeMap<String, String>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            base_url: DEFAULT_BASE_URL.to_owned(),
            hotkey: default_hotkey().to_owned(),
            source: String::new(),
            source_map: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FileConfig {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    hotkey: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    source: String,
    #[serde(
        default,
        rename = "sourceMap",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    source_map: BTreeMap<String, String>,
}

/// The per-user config location. Windows keeps the original
/// `%LOCALAPPDATA%\Funnel\Intake\config.json`; macOS uses the corresponding
/// Application Support path; other platforms use the XDG config directory.
pub fn default_config_path() -> PathBuf {
    if let Some(dir) = non_empty_env("LOCALAPPDATA") {
        return Path::new(&dir)
            .join("Funnel")
            .join("Intake")
            .join("config.json");
    }
    if cfg!(target_os = "macos")
        && let Some(home) = non_empty_env("HOME")
    {
        return Path::new(&home)
            .join("Library")
            .join("Application Support")
            .join("Funnel")
            .join("Intake")
            .join("config.json");
    }
    if let Some(dir) = non_empty_env("XDG_CONFIG_HOME") {
        return Path::new(&dir).join("funnel-intake").join("config.json");
    }
    if let Some(home) = non_empty_env("HOME") {
        return Path::new(&home)
            .join(".config")
            .join("funnel-intake")
            .join("config.json");
    }
    PathBuf::from("config.json")
}

/// Reads the file (if present), then applies `FUNNEL_URL`, `FUNNEL_HOTKEY`
/// and `FUNNEL_SOURCE`.
pub fn load_config(path: &Path) -> Result<Config, String> {
    load_config_with_env(path, |name| std::env::var(name).ok())
}

pub fn load_file_config(path: &Path) -> Result<Config, String> {
    let mut config = Config::default();
    apply_file(&mut config, path)?;
    config.normalize()?;
    Ok(config)
}

pub fn load_config_with_env(
    path: &Path,
    env: impl Fn(&str) -> Option<String>,
) -> Result<Config, String> {
    let mut config = Config::default();
    apply_file(&mut config, path)?;
    if let Some(value) = env("FUNNEL_URL").filter(|value| !value.trim().is_empty()) {
        config.base_url = value;
    }
    if let Some(value) = env("FUNNEL_HOTKEY").filter(|value| !value.trim().is_empty()) {
        config.hotkey = value;
    }
    if let Some(value) = env("FUNNEL_SOURCE").filter(|value| !value.trim().is_empty()) {
        config.source = value;
    }
    config.normalize()?;
    Ok(config)
}

fn apply_file(config: &mut Config, path: &Path) -> Result<(), String> {
    let data = match fs::read(path) {
        Ok(data) => data,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(format!("read {}: {err}", path.display())),
    };
    let data = data.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&data);
    if data.iter().all(u8::is_ascii_whitespace) {
        return Ok(());
    }

    let file: FileConfig = serde_json::from_slice(data)
        .map_err(|err| format!("read {}: parse config: {err}", path.display()))?;

    if !file.url.trim().is_empty() {
        config.base_url = file.url;
    }
    if !file.hotkey.trim().is_empty() {
        config.hotkey = file.hotkey;
    }
    if !file.source.trim().is_empty() {
        config.source = file.source;
    }
    for (key, value) in file.source_map {
        let name = normalize_process_name(&key);
        if name.is_empty() {
            continue;
        }
        if value.trim().is_empty() {
            config.source_map.remove(&name);
        } else {
            config.source_map.insert(name, value);
        }
    }
    Ok(())
}

pub fn save_config(path: &Path, config: &Config) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("create {}: {err}", parent.display()))?;
    }
    let file = FileConfig {
        url: config.base_url.clone(),
        hotkey: config.hotkey.clone(),
        source: config.source.clone(),
        source_map: config.source_map.clone(),
    };
    let mut json =
        serde_json::to_string_pretty(&file).map_err(|err| format!("encode config: {err}"))?;
    json.push('\n');
    fs::write(path, json).map_err(|err| format!("write {}: {err}", path.display()))
}

impl Config {
    pub fn normalize(&mut self) -> Result<(), String> {
        if self.base_url.trim().is_empty() {
            self.base_url = DEFAULT_BASE_URL.to_owned();
        }
        if self.hotkey.trim().is_empty() {
            self.hotkey = default_hotkey().to_owned();
        }

        self.base_url = normalize_base_url(&self.base_url)
            .map_err(|err| format!("invalid FUNNEL_URL: {err}"))?;
        self.hotkey = self.hotkey.trim().to_owned();
        Hotkey::parse(&self.hotkey).map_err(|err| format!("invalid hotkey: {err}"))?;
        self.source = normalize_source(&self.source);

        let mut normalized = BTreeMap::new();
        for (key, value) in &self.source_map {
            let name = normalize_process_name(key);
            if name.is_empty() || value.trim().is_empty() {
                continue;
            }
            normalized.insert(name, normalize_source(value));
        }
        self.source_map = normalized;
        Ok(())
    }

    /// CLI flags override the environment and the file.
    pub fn apply_cli_overrides(
        &mut self,
        url: Option<&str>,
        hotkey: Option<&str>,
        source: Option<&str>,
    ) {
        if let Some(value) = url.filter(|value| !value.is_empty()) {
            self.base_url = value.to_owned();
        }
        if let Some(value) = hotkey.filter(|value| !value.is_empty()) {
            self.hotkey = value.to_owned();
        }
        if let Some(value) = source.filter(|value| !value.is_empty()) {
            self.source = value.to_owned();
        }
    }
}

pub fn normalize_base_url(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err("URL is empty".to_owned());
    }
    let mut parsed = Url::parse(value).map_err(|err| err.to_string())?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(format!(
            "URL must use http or https (got {:?})",
            parsed.scheme()
        ));
    }
    if parsed.host_str().is_none() {
        return Err("URL has no host".to_owned());
    }
    if parsed.query().is_some() {
        return Err("URL must not include a query string".to_owned());
    }
    if parsed.fragment().is_some() {
        return Err("URL must not include a fragment".to_owned());
    }
    let path = parsed.path().trim_end_matches('/').to_owned();
    parsed.set_path(&path);
    let mut normalized = parsed.to_string();
    if parsed.path() == "/" && normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

fn non_empty_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "funnel-intake-test-{}-{}",
            std::process::id(),
            name
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("config.json")
    }

    #[test]
    fn defaults_when_file_is_missing() {
        let path = temp_path("missing");
        let config = load_config_with_env(&path, |_| None).unwrap();
        assert_eq!(config.base_url, DEFAULT_BASE_URL);
        assert_eq!(config.hotkey, default_hotkey());
        assert!(config.source_map.is_empty());
    }

    #[test]
    fn file_and_environment_precedence() {
        let path = temp_path("precedence");
        fs::write(
            &path,
            r#"{
  "url": "https://funnel.example.com/funnel/",
  "hotkey": "Win+Shift+F9",
  "source": "walk-in",
  "sourceMap": { "ms-teams": "meeting", "slack": "" }
}"#,
        )
        .unwrap();

        let config = load_config_with_env(&path, |_| None).unwrap();
        assert_eq!(config.base_url, "https://funnel.example.com/funnel");
        assert_eq!(config.hotkey, "Win+Shift+F9");
        assert_eq!(config.source, "walk-in");
        assert_eq!(
            config.source_map.get("ms-teams").map(String::as_str),
            Some("meeting")
        );
        assert!(!config.source_map.contains_key("slack"));

        let env = |name: &str| match name {
            "FUNNEL_URL" => Some("http://localhost:5173".to_owned()),
            "FUNNEL_HOTKEY" => Some("Ctrl+Alt+K".to_owned()),
            "FUNNEL_SOURCE" => Some("chat".to_owned()),
            _ => None,
        };
        let config = load_config_with_env(&path, env).unwrap();
        assert_eq!(config.base_url, "http://localhost:5173");
        assert_eq!(config.hotkey, "Ctrl+Alt+K");
        assert_eq!(config.source, "chat");
    }

    #[test]
    fn bom_is_accepted_and_unknown_fields_are_rejected() {
        let dir = temp_path("bom");
        let bom_path = dir.parent().unwrap().join("bom.json");
        let mut bytes = b"\xEF\xBB\xBF".to_vec();
        bytes.extend_from_slice(br#"{"hotkey":"Ctrl+Alt+J"}"#);
        fs::write(&bom_path, bytes).unwrap();
        let config = load_file_config(&bom_path).unwrap();
        assert_eq!(config.hotkey, "Ctrl+Alt+J");

        let unknown_path = dir.parent().unwrap().join("unknown.json");
        fs::write(&unknown_path, br#"{"nope":true}"#).unwrap();
        assert!(load_config(&unknown_path).is_err());
    }

    #[test]
    fn cli_overrides_beat_environment_and_file() {
        let path = temp_path("cli");
        fs::write(
            &path,
            r#"{"url":"https://file.example","hotkey":"Ctrl+Alt+A"}"#,
        )
        .unwrap();
        let mut config = load_config_with_env(&path, |name| {
            (name == "FUNNEL_URL").then(|| "https://env.example".to_owned())
        })
        .unwrap();
        config.apply_cli_overrides(
            Some("https://cli.example"),
            Some("Ctrl+Alt+B"),
            Some("email"),
        );
        config.normalize().unwrap();
        assert_eq!(config.base_url, "https://cli.example");
        assert_eq!(config.hotkey, "Ctrl+Alt+B");
        assert_eq!(config.source, "email");
    }

    #[test]
    fn bad_values_are_rejected() {
        let cases = [
            Config {
                base_url: "ftp://example.com".to_owned(),
                ..Config::default()
            },
            Config {
                base_url: "http://example.com".to_owned(),
                hotkey: "I".to_owned(),
                ..Config::default()
            },
            Config {
                base_url: "http://example.com".to_owned(),
                hotkey: "Ctrl+Unknown".to_owned(),
                ..Config::default()
            },
        ];
        for mut config in cases {
            assert!(config.normalize().is_err(), "{config:?} should fail");
        }
    }

    #[test]
    fn save_round_trips_and_preserves_source_map() {
        let path = temp_path("save");
        let mut config = Config {
            base_url: "http://localhost:3000".to_owned(),
            hotkey: "Option+F".to_owned(),
            source: "chat".to_owned(),
            source_map: BTreeMap::from([("slack".to_owned(), "meeting".to_owned())]),
        };
        config.normalize().unwrap();
        save_config(&path, &config).unwrap();
        let loaded = load_file_config(&path).unwrap();
        assert_eq!(loaded, config);
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("sourceMap"));
        assert!(!text.starts_with('\u{feff}'));
    }

    #[test]
    fn default_path_uses_local_app_data_when_present() {
        if let Some(dir) = non_empty_env("LOCALAPPDATA") {
            assert_eq!(
                default_config_path(),
                Path::new(&dir)
                    .join("Funnel")
                    .join("Intake")
                    .join("config.json")
            );
        }
    }
}
