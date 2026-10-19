package intake

import (
	"os"
	"path/filepath"
	"testing"
)

func clearFunnelEnv(t *testing.T) {
	t.Helper()
	t.Setenv("FUNNEL_URL", "")
	t.Setenv("FUNNEL_HOTKEY", "")
	t.Setenv("FUNNEL_SOURCE", "")
}

func TestDefaultConfig(t *testing.T) {
	clearFunnelEnv(t)
	cfg, err := LoadConfig(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.BaseURL != DefaultBaseURL {
		t.Errorf("BaseURL = %q, want %q", cfg.BaseURL, DefaultBaseURL)
	}
	if cfg.Hotkey != DefaultHotkey {
		t.Errorf("Hotkey = %q, want %q", cfg.Hotkey, DefaultHotkey)
	}
	if cfg.SourceMap == nil {
		t.Error("SourceMap is nil, want an initialized map")
	}
}

func TestLoadConfigFileAndEnvironment(t *testing.T) {
	clearFunnelEnv(t)
	path := filepath.Join(t.TempDir(), "config.json")
	contents := `{
  "url": "https://funnel.example.com/funnel/",
  "hotkey": "Win+Shift+F9",
  "source": "walk-in",
  "sourceMap": { "ms-teams": "meeting", "slack": "" }
}`
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	cfg, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.BaseURL != "https://funnel.example.com/funnel" {
		t.Errorf("BaseURL = %q, want the trailing slash removed", cfg.BaseURL)
	}
	if cfg.Hotkey != "Win+Shift+F9" {
		t.Errorf("Hotkey = %q, want Win+Shift+F9", cfg.Hotkey)
	}
	if cfg.Source != "walk-in" {
		t.Errorf("Source = %q, want walk-in", cfg.Source)
	}
	if cfg.SourceMap["ms-teams"] != "meeting" {
		t.Errorf("SourceMap[ms-teams] = %q, want meeting", cfg.SourceMap["ms-teams"])
	}
	if _, ok := cfg.SourceMap["slack"]; ok {
		t.Error("empty sourceMap values should be dropped")
	}

	t.Setenv("FUNNEL_URL", "http://localhost:5173")
	t.Setenv("FUNNEL_HOTKEY", "Ctrl+Alt+K")
	t.Setenv("FUNNEL_SOURCE", "chat")

	cfg, err = LoadConfig(path)
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.BaseURL != "http://localhost:5173" {
		t.Errorf("BaseURL = %q, want the environment override", cfg.BaseURL)
	}
	if cfg.Hotkey != "Ctrl+Alt+K" {
		t.Errorf("Hotkey = %q, want the environment override", cfg.Hotkey)
	}
	if cfg.Source != "chat" {
		t.Errorf("Source = %q, want the environment override", cfg.Source)
	}
}

func TestLoadConfigAcceptsBOMAndRejectsUnknownFields(t *testing.T) {
	clearFunnelEnv(t)
	dir := t.TempDir()

	bomPath := filepath.Join(dir, "bom.json")
	bom := append([]byte{0xEF, 0xBB, 0xBF}, []byte(`{"hotkey":"Ctrl+Alt+J"}`)...)
	if err := os.WriteFile(bomPath, bom, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	cfg, err := LoadConfig(bomPath)
	if err != nil {
		t.Fatalf("LoadConfig(BOM) returned error: %v", err)
	}
	if cfg.Hotkey != "Ctrl+Alt+J" {
		t.Errorf("Hotkey = %q, want Ctrl+Alt+J", cfg.Hotkey)
	}

	unknownPath := filepath.Join(dir, "unknown.json")
	if err := os.WriteFile(unknownPath, []byte(`{"nope": true}`), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if _, err := LoadConfig(unknownPath); err == nil {
		t.Error("LoadConfig with an unknown field succeeded, want error")
	}
}

func TestNormalizeRejectsBadValues(t *testing.T) {
	tests := []Config{
		{BaseURL: "ftp://example.com"},
		{BaseURL: "http://example.com", Hotkey: "I"},
		{BaseURL: "http://example.com", Hotkey: "Ctrl+Unknown"},
	}
	for _, cfg := range tests {
		if err := cfg.Normalize(); err == nil {
			t.Errorf("Normalize(%+v) succeeded, want error", cfg)
		}
	}
}
