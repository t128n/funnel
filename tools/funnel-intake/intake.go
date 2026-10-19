// Package intake implements the Funnel intake hotkey helper for Windows.
//
// The package owns a global hotkey, captures the current text selection through
// the clipboard, and opens `{FUNNEL_URL}/intake` in the default browser with
// the selection prefilled. It is intentionally small and dependency-free apart
// from golang.org/x/sys/windows.
//
// The pure parts — hotkey parsing, prefill clamping, deeplink encoding, and URL
// building — live in platform-independent files so they can be tested on any
// OS. Only Run (and Preview) have Windows implementations; other platforms
// return ErrUnsupported.
package intake

import (
	"context"
	"errors"
	"log"
)

// ErrUnsupported is returned by Run on platforms other than Windows.
var ErrUnsupported = errors.New("intake: the hotkey helper is only supported on Windows")

// Config controls the helper.
//
// BaseURL is the Funnel origin (for example https://funnel.example.com); the
// helper appends /intake. Hotkey uses the syntax accepted by ParseHotkey, such
// as "Ctrl+Alt+I". Source overrides foreground-app detection when non-empty.
// SourceMap maps a lower-case process name (without .exe) to an intake source;
// entries merge over the built-in defaults.
type Config struct {
	BaseURL   string
	Hotkey    string
	Source    string
	SourceMap map[string]string
	Logger    *log.Logger

	// DryRun makes the helper log what it would open instead of launching a
	// browser. Intended for troubleshooting and integration checks.
	DryRun bool
}

// Run starts the hotkey listener and blocks until ctx is cancelled or the
// listener fails. It is only implemented on Windows.
func Run(ctx context.Context, cfg Config) error {
	return run(ctx, cfg)
}
