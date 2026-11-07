use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn temp_config(name: &str, contents: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "funnel-intake-simulate-{}-{}",
        std::process::id(),
        name
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.json");
    fs::write(&path, contents).unwrap();
    path
}

#[test]
fn simulate_prints_the_exact_prefilled_url() {
    let path = temp_config(
        "exact",
        r#"{"url":"http://localhost:3000","hotkey":"Alt+F","source":"email"}"#,
    );
    let output = Command::new(env!("CARGO_BIN_EXE_funnel-intake"))
        .args(["daemon", "--simulate", "Hello\nworld", "--config"])
        .arg(&path)
        .output()
        .expect("run funnel-intake");
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        stdout.trim(),
        "url=http://localhost:3000/intake?body=Hello%0Aworld&source=email&title=Hello"
    );
}

#[test]
fn simulate_maps_the_fake_process_to_a_source() {
    let path = temp_config("process", r#"{"url":"http://localhost:3000"}"#);
    let output = Command::new(env!("CARGO_BIN_EXE_funnel-intake"))
        .args(["daemon", "--simulate", "hello", "--config"])
        .arg(&path)
        .output()
        .expect("run funnel-intake");
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert_eq!(
        stdout.trim(),
        "url=http://localhost:3000/intake?body=hello&source=simulated-app&title=hello"
    );
}
