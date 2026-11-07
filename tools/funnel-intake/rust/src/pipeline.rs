//! The platform-independent intake flow.
//!
//! A hotkey event triggers one pass: identify the foreground app, map it to a
//! source, capture the selection, build the `/intake` URL, then hand that URL
//! to the browser launcher. The selection is captured before the launcher is
//! invoked, which is the contract recorded in `PARITY.md`.

use crate::config::Config;
use crate::deeplink::build_url;
use crate::prefill::{Prefill, build_prefill, source_for_process};

pub trait SelectionCapture {
    /// The executable/process name of the foreground app. Detection failures
    /// are reported to the caller but do not abort the intake flow.
    fn foreground_process(&mut self) -> Result<String, String>;

    /// Captures the current selection. A failure still opens a blank draft.
    fn capture(&mut self) -> Result<String, String>;
}

pub trait BrowserLauncher {
    fn open(&mut self, url: &str) -> Result<(), String>;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IntakeOutcome {
    pub url: String,
    pub prefill: Prefill,
    pub process: String,
    pub source: String,
    pub truncated: bool,
    pub capture_error: Option<String>,
    pub foreground_error: Option<String>,
}

pub fn run_intake(
    config: &Config,
    capture: &mut dyn SelectionCapture,
    launcher: &mut dyn BrowserLauncher,
) -> Result<IntakeOutcome, String> {
    let (process, foreground_error) = match capture.foreground_process() {
        Ok(process) => (process, None),
        Err(err) => ("unknown".to_owned(), Some(err)),
    };

    let source = if config.source.trim().is_empty() {
        source_for_process(&process, &config.source_map)
    } else {
        config.source.clone()
    };

    let (selection, capture_error) = match capture.capture() {
        Ok(selection) => (selection, None),
        Err(err) => (String::new(), Some(err)),
    };

    let prefill = build_prefill(&selection, &source);
    let (url, truncated) = build_url(&config.base_url, prefill.clone())?;

    // Capture and encoding are finished before the browser is touched.
    launcher.open(&url)?;

    Ok(IntakeOutcome {
        url,
        prefill,
        process,
        source,
        truncated,
        capture_error,
        foreground_error,
    })
}

/// One fake capture used by `daemon --simulate`.
pub struct SimulatedCapture {
    pub process: String,
    pub selection: String,
    pub captured: bool,
    pub capture_error: Option<String>,
}

impl SimulatedCapture {
    pub fn new(process: impl Into<String>, selection: impl Into<String>) -> Self {
        SimulatedCapture {
            process: process.into(),
            selection: selection.into(),
            captured: false,
            capture_error: None,
        }
    }
}

impl SelectionCapture for SimulatedCapture {
    fn foreground_process(&mut self) -> Result<String, String> {
        Ok(self.process.clone())
    }

    fn capture(&mut self) -> Result<String, String> {
        self.captured = true;
        match &self.capture_error {
            Some(err) => Err(err.clone()),
            None => Ok(self.selection.clone()),
        }
    }
}

/// A launcher that prints the URL instead of opening a browser.
#[derive(Default)]
pub struct PrintLauncher {
    pub opened: Vec<String>,
}

impl BrowserLauncher for PrintLauncher {
    fn open(&mut self, url: &str) -> Result<(), String> {
        println!("url={url}");
        self.opened.push(url.to_owned());
        Ok(())
    }
}

/// Runs the simulated pipeline and prints the URL through the launcher trait.
pub fn simulate(config: &Config, selection: &str, process: &str) -> Result<IntakeOutcome, String> {
    let mut capture = SimulatedCapture::new(process, selection);
    let mut launcher = PrintLauncher::default();
    run_intake(config, &mut capture, &mut launcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    struct RecordingCapture {
        events: Rc<RefCell<Vec<&'static str>>>,
        selection: String,
        process: String,
        capture_error: Option<String>,
    }

    impl SelectionCapture for RecordingCapture {
        fn foreground_process(&mut self) -> Result<String, String> {
            self.events.borrow_mut().push("foreground");
            Ok(self.process.clone())
        }

        fn capture(&mut self) -> Result<String, String> {
            self.events.borrow_mut().push("capture");
            match &self.capture_error {
                Some(err) => Err(err.clone()),
                None => Ok(self.selection.clone()),
            }
        }
    }

    struct RecordingLauncher {
        events: Rc<RefCell<Vec<&'static str>>>,
        urls: Vec<String>,
    }

    impl BrowserLauncher for RecordingLauncher {
        fn open(&mut self, url: &str) -> Result<(), String> {
            self.events.borrow_mut().push("launch");
            self.urls.push(url.to_owned());
            Ok(())
        }
    }

    #[test]
    fn captures_before_launching_and_builds_the_expected_url() {
        let events = Rc::new(RefCell::new(Vec::new()));
        let mut capture = RecordingCapture {
            events: events.clone(),
            selection: "Fix the login flow\nsecond line".to_owned(),
            process: "ms-teams.exe".to_owned(),
            capture_error: None,
        };
        let mut launcher = RecordingLauncher {
            events: events.clone(),
            urls: Vec::new(),
        };
        let config = Config {
            base_url: "http://localhost:3000".to_owned(),
            hotkey: "Alt+F".to_owned(),
            source: String::new(),
            source_map: Default::default(),
        };

        let outcome = run_intake(&config, &mut capture, &mut launcher).unwrap();
        assert_eq!(
            outcome.url,
            "http://localhost:3000/intake?body=Fix+the+login+flow%0Asecond+line&source=chat&title=Fix+the+login+flow"
        );
        assert_eq!(*events.borrow(), vec!["foreground", "capture", "launch"]);
        assert_eq!(launcher.urls, vec![outcome.url]);
    }

    #[test]
    fn capture_failure_still_opens_a_blank_draft() {
        let events = Rc::new(RefCell::new(Vec::new()));
        let mut capture = RecordingCapture {
            events: events.clone(),
            selection: "ignored".to_owned(),
            process: "outlook".to_owned(),
            capture_error: Some("accessibility permission missing".to_owned()),
        };
        let mut launcher = RecordingLauncher {
            events: events.clone(),
            urls: Vec::new(),
        };
        let config = Config {
            base_url: "http://localhost:3000".to_owned(),
            hotkey: "Alt+F".to_owned(),
            source: "self-service".to_owned(),
            source_map: Default::default(),
        };
        let outcome = run_intake(&config, &mut capture, &mut launcher).unwrap();
        assert_eq!(
            outcome.url,
            "http://localhost:3000/intake?source=self-service"
        );
        assert!(outcome.prefill.body.is_empty());
    }
}
