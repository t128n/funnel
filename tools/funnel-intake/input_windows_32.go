//go:build windows && !amd64 && !arm64

package intake

// sendCopy falls back to the legacy keybd_event API on 32-bit Windows, where
// the INPUT union layout differs. The modern 64-bit path uses SendInput.
func sendCopy() error {
	procKeybdEvent.Call(0x11, 0, 0, 0) // Ctrl down
	procKeybdEvent.Call(0x43, 0, 0, 0) // C down
	procKeybdEvent.Call(0x43, 0, keyeventfKeyUp, 0)
	procKeybdEvent.Call(0x11, 0, keyeventfKeyUp, 0)
	return nil
}
