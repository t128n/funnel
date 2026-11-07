//! Small rotating log beside the config. Never logs selected text.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

struct Logger {
    path: PathBuf,
    debug: bool,
    file: Mutex<Option<File>>,
}

static LOGGER: OnceLock<Logger> = OnceLock::new();

pub fn init(dir: &Path, debug: bool) {
    let _ = LOGGER.get_or_init(|| {
        let path = dir.join("intake.log");
        rotate(&path);
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok();
        Logger {
            path,
            debug,
            file: Mutex::new(file),
        }
    });
}

pub fn log(message: impl AsRef<str>) {
    let message = message.as_ref();
    if let Some(logger) = LOGGER.get() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        let line = format!("[{timestamp}] {message}\n");
        if logger.debug {
            eprint!("{line}");
        }
        if let Ok(mut file) = logger.file.lock()
            && let Some(file) = file.as_mut()
        {
            rotate_if_needed(&logger.path, file);
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

fn rotate(path: &Path) {
    if let Ok(meta) = fs::metadata(path)
        && meta.len() >= 1 << 20
    {
        let _ = fs::remove_file(path.with_extension("log.old"));
        let _ = fs::rename(path, path.with_extension("log.old"));
    }
}

fn rotate_if_needed(path: &Path, file: &mut File) {
    if let Ok(meta) = file.metadata()
        && meta.len() >= 1 << 20
    {
        let _ = fs::remove_file(path.with_extension("log.old"));
        let _ = fs::rename(path, path.with_extension("log.old"));
        if let Ok(new_file) = OpenOptions::new().create(true).append(true).open(path) {
            *file = new_file;
        }
    }
}
