//go:build windows

package intake

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"
)

// captureSelection grabs the current selection by seeding the clipboard with a
// unique sentinel, sending Ctrl+C, and waiting for the clipboard to change. The
// previous plain-text clipboard content is restored afterwards; non-text
// formats (images, files) cannot be restored.
func captureSelection(logger *log.Logger) (string, error) {
	if !waitForModifiersReleased(750*time.Millisecond) && logger != nil {
		logger.Printf("hotkey modifiers still held after 750ms; capturing anyway")
	}

	original, hadText, err := readClipboardText()
	if err != nil {
		return "", fmt.Errorf("read clipboard: %w", err)
	}

	// Restore as soon as we know the previous state, even if seeding fails.
	defer restoreClipboard(original, hadText, logger)

	sentinel := newSentinel()
	if err := writeClipboardText(sentinel); err != nil {
		return "", fmt.Errorf("seed clipboard: %w", err)
	}

	sentinelSequence := clipboardSequence()
	if err := sendCopy(); err != nil {
		return "", fmt.Errorf("send Ctrl+C: %w", err)
	}

	deadline := time.Now().Add(1200 * time.Millisecond)
	for time.Now().Before(deadline) {
		time.Sleep(30 * time.Millisecond)
		if clipboardSequence() == sentinelSequence {
			continue
		}

		current, found, err := readClipboardText()
		if err != nil || !found {
			continue
		}
		if strings.TrimSpace(current) == sentinel {
			continue
		}
		return current, nil
	}

	return "", nil
}

func restoreClipboard(original string, hadText bool, logger *log.Logger) {
	if hadText {
		if err := writeClipboardText(original); err != nil && logger != nil {
			logger.Printf("restore clipboard: %v", err)
		}
		return
	}
	if err := writeClipboardText(""); err != nil && logger != nil {
		logger.Printf("clear clipboard: %v", err)
	}
}

func newSentinel() string {
	var buffer [8]byte
	if _, err := rand.Read(buffer[:]); err != nil {
		return fmt.Sprintf("funnel-intake-%d", time.Now().UnixNano())
	}
	return "funnel-intake-" + hex.EncodeToString(buffer[:])
}
