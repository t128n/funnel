//go:build windows

package intake

import (
	"context"
	"io"
	"log"
	"strings"
	"sync/atomic"
)

func run(ctx context.Context, cfg Config) error {
	if err := cfg.Normalize(); err != nil {
		return err
	}

	logger := cfg.Logger
	if logger == nil {
		logger = log.New(io.Discard, "", 0)
	}
	cfg.Logger = logger

	hotkey, err := ParseHotkey(cfg.Hotkey)
	if err != nil {
		return err
	}

	logger.Printf("starting: hotkey=%s url=%s", hotkey, cfg.BaseURL)

	var busy atomic.Bool
	return listenHotkey(ctx, hotkey, func() {
		if !busy.CompareAndSwap(false, true) {
			logger.Printf("capture already in progress; ignoring hotkey")
			return
		}
		defer busy.Store(false)
		handleHotkey(cfg)
	})
}

// Preview performs one capture and returns the prefill and the URL that the
// helper would open, without launching a browser. It backs the -test flag and
// is useful for debugging the capture pipeline.
func Preview(cfg Config) (Prefill, string, bool, error) {
	if err := cfg.Normalize(); err != nil {
		return Prefill{}, "", false, err
	}

	prefill, _, captureErr := collectPrefill(cfg)
	if captureErr != nil {
		return prefill, "", false, captureErr
	}

	target, truncated, err := BuildURL(cfg.BaseURL, prefill)
	if err != nil {
		return prefill, "", false, err
	}
	return prefill, target, truncated, nil
}

func handleHotkey(cfg Config) {
	logger := cfg.Logger
	if logger == nil {
		logger = log.New(io.Discard, "", 0)
	}

	prefill, process, captureErr := collectPrefill(cfg)
	if captureErr != nil {
		logger.Printf("capture failed: %v", captureErr)
	}

	if strings.TrimSpace(prefill.Body) == "" {
		logger.Printf("no selection captured (app=%s source=%s); opening blank form", process, prefill.Source)
	}

	target, truncated, err := BuildURL(cfg.BaseURL, prefill)
	if err != nil {
		logger.Printf("build URL: %v", err)
		beep()
		return
	}
	if truncated {
		logger.Printf("selection trimmed to fit the %d-character deeplink limit", DeeplinkMax)
	}

	if cfg.DryRun {
		logger.Printf(
			"dry-run: would open intake (app=%s source=%s title=%d chars body=%d chars)",
			process, prefill.Source, utf16Length(prefill.Title), utf16Length(prefill.Body),
		)
		return
	}

	if err := openURL(target); err != nil {
		logger.Printf("open browser: %v", err)
		beep()
		return
	}

	logger.Printf(
		"opened intake (app=%s source=%s title=%d chars body=%d chars)",
		process, prefill.Source, utf16Length(prefill.Title), utf16Length(prefill.Body),
	)
}

func collectPrefill(cfg Config) (Prefill, string, error) {
	process, foregroundErr := foregroundProcessName()
	if foregroundErr != nil {
		if cfg.Logger != nil {
			cfg.Logger.Printf("foreground app: %v", foregroundErr)
		}
		process = "unknown"
	}

	source := cfg.Source
	if source == "" {
		source = SourceForProcess(process, cfg.SourceMap)
	}

	selection, captureErr := captureSelection(cfg.Logger)
	return BuildPrefill(selection, source), process, captureErr
}
