package intake

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	// DefaultBaseURL points at the packaged Windows service. Development
	// checkouts override it with -url or FUNNEL_URL=http://localhost:5173.
	DefaultBaseURL = "http://localhost:3000"

	// DefaultHotkey is the same combo the old .lnk shortcut used.
	DefaultHotkey = "Ctrl+Alt+I"
)

var builtinSourceMap = map[string]string{
	"ms-teams":    "chat",
	"teams":       "chat",
	"msteams":     "chat",
	"slack":       "chat",
	"discord":     "chat",
	"outlook":     "email",
	"thunderbird": "email",
	"zoom":        "meeting",
	"webex":       "meeting",
}

type fileConfig struct {
	URL       string            `json:"url"`
	Hotkey    string            `json:"hotkey"`
	Source    string            `json:"source"`
	SourceMap map[string]string `json:"sourceMap"`
}

// DefaultConfig returns the built-in defaults, including the source map.
func DefaultConfig() Config {
	return Config{
		BaseURL:   DefaultBaseURL,
		Hotkey:    DefaultHotkey,
		SourceMap: map[string]string{},
	}
}

// DefaultConfigPath returns the per-user config location.
//
// On Windows this is %LOCALAPPDATA%\Funnel\Intake\config.json. The fallback
// keeps `go run` usable on other platforms.
func DefaultConfigPath() string {
	if dir := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); dir != "" {
		return filepath.Join(dir, "Funnel", "Intake", "config.json")
	}
	if dir, err := os.UserConfigDir(); err == nil {
		return filepath.Join(dir, "funnel-intake", "config.json")
	}
	return "config.json"
}

// LoadConfig reads a JSON config file, applies FUNNEL_URL / FUNNEL_HOTKEY /
// FUNNEL_SOURCE, and normalizes the result. A missing file is not an error so
// the helper can start with defaults before the installer writes one.
func LoadConfig(path string) (Config, error) {
	cfg := DefaultConfig()

	if path != "" {
		data, err := os.ReadFile(path)
		switch {
		case err == nil:
			if err := applyFileConfig(&cfg, data); err != nil {
				return Config{}, fmt.Errorf("read %s: %w", path, err)
			}
		case os.IsNotExist(err):
			// Defaults are fine; the installer writes the file.
		default:
			return Config{}, fmt.Errorf("read %s: %w", path, err)
		}
	}

	if value := strings.TrimSpace(os.Getenv("FUNNEL_URL")); value != "" {
		cfg.BaseURL = value
	}
	if value := strings.TrimSpace(os.Getenv("FUNNEL_HOTKEY")); value != "" {
		cfg.Hotkey = value
	}
	if value := strings.TrimSpace(os.Getenv("FUNNEL_SOURCE")); value != "" {
		cfg.Source = value
	}

	if err := cfg.Normalize(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func applyFileConfig(cfg *Config, data []byte) error {
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}

	var file fileConfig
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return fmt.Errorf("parse config: %w", err)
	}

	if value := strings.TrimSpace(file.URL); value != "" {
		cfg.BaseURL = value
	}
	if value := strings.TrimSpace(file.Hotkey); value != "" {
		cfg.Hotkey = value
	}
	if value := strings.TrimSpace(file.Source); value != "" {
		cfg.Source = value
	}
	for key, value := range file.SourceMap {
		name := normalizeProcessName(key)
		if name == "" {
			continue
		}
		if strings.TrimSpace(value) == "" {
			delete(cfg.SourceMap, name)
			continue
		}
		cfg.SourceMap[name] = value
	}
	return nil
}

// Normalize fills defaults and validates the URL and hotkey. It is safe to
// call repeatedly. SourceMap entries are user overrides; the built-in map is
// applied at lookup time by SourceForProcess.
func (c *Config) Normalize() error {
	if strings.TrimSpace(c.BaseURL) == "" {
		c.BaseURL = DefaultBaseURL
	}
	if strings.TrimSpace(c.Hotkey) == "" {
		c.Hotkey = DefaultHotkey
	}

	base, err := normalizeBaseURL(c.BaseURL)
	if err != nil {
		return fmt.Errorf("invalid FUNNEL_URL: %w", err)
	}
	c.BaseURL = base

	c.Hotkey = strings.TrimSpace(c.Hotkey)
	if _, err := ParseHotkey(c.Hotkey); err != nil {
		return fmt.Errorf("invalid hotkey: %w", err)
	}

	c.Source = normalizeSource(c.Source)

	normalized := make(map[string]string, len(c.SourceMap))
	for key, value := range c.SourceMap {
		name := normalizeProcessName(key)
		if name == "" || strings.TrimSpace(value) == "" {
			continue
		}
		normalized[name] = normalizeSource(value)
	}
	c.SourceMap = normalized

	return nil
}
