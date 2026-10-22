//go:build windows

package intake

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	wmHotkey       = 0x0312
	wmQuit         = 0x0012
	cfUnicodeText  = 13
	gmemMoveable   = 0x0002
	processQuery   = 0x1000
	keyeventfKeyUp = 0x0002
	swShownormal   = 1
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procGetWindowThreadProcessId   = user32.NewProc("GetWindowThreadProcessId")
	procRegisterHotKey             = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey           = user32.NewProc("UnregisterHotKey")
	procGetMessageW                = user32.NewProc("GetMessageW")
	procTranslateMessage           = user32.NewProc("TranslateMessage")
	procDispatchMessageW           = user32.NewProc("DispatchMessageW")
	procPostThreadMessageW         = user32.NewProc("PostThreadMessageW")
	procOpenClipboard              = user32.NewProc("OpenClipboard")
	procCloseClipboard             = user32.NewProc("CloseClipboard")
	procEmptyClipboard             = user32.NewProc("EmptyClipboard")
	procGetClipboardData           = user32.NewProc("GetClipboardData")
	procSetClipboardData           = user32.NewProc("SetClipboardData")
	procIsClipboardFormatAvailable = user32.NewProc("IsClipboardFormatAvailable")
	procGetClipboardSequenceNumber = user32.NewProc("GetClipboardSequenceNumber")
	procSendInput                  = user32.NewProc("SendInput")
	procKeybdEvent                 = user32.NewProc("keybd_event")
	procGetAsyncKeyState           = user32.NewProc("GetAsyncKeyState")
	procMessageBeep                = user32.NewProc("MessageBeep")

	procGlobalAlloc  = kernel32.NewProc("GlobalAlloc")
	procGlobalFree   = kernel32.NewProc("GlobalFree")
	procGlobalLock   = kernel32.NewProc("GlobalLock")
	procGlobalUnlock = kernel32.NewProc("GlobalUnlock")
)

// winMsg mirrors the Win32 MSG layout. Go's natural alignment produces the
// same 48-byte (64-bit) / 28-byte (32-bit) structure as the SDK definition.
type winMsg struct {
	hwnd    windows.HWND
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

type point struct {
	x int32
	y int32
}

func winError(err error) error {
	if err == nil || errors.Is(err, syscall.Errno(0)) {
		return errors.New("Windows call failed")
	}
	return err
}

func withClipboard(fn func() error) error {
	var lastErr error
	for attempt := 0; attempt < 12; attempt++ {
		opened, _, err := procOpenClipboard.Call(0)
		if opened != 0 {
			var callErr error
			func() {
				defer procCloseClipboard.Call()
				callErr = fn()
			}()
			return callErr
		}
		lastErr = err
		time.Sleep(15 * time.Millisecond)
	}
	return fmt.Errorf("OpenClipboard: %w", winError(lastErr))
}

func readClipboardText() (string, bool, error) {
	var (
		text  string
		found bool
	)

	err := withClipboard(func() error {
		available, _, _ := procIsClipboardFormatAvailable.Call(cfUnicodeText)
		if available == 0 {
			return nil
		}

		handle, _, _ := procGetClipboardData.Call(cfUnicodeText)
		if handle == 0 {
			return nil
		}

		ptr, _, err := procGlobalLock.Call(handle)
		if ptr == 0 {
			return fmt.Errorf("GlobalLock: %w", winError(err))
		}
		defer procGlobalUnlock.Call(handle)

		text = windows.UTF16PtrToString((*uint16)(unsafe.Pointer(ptr)))
		found = true
		return nil
	})
	return text, found, err
}

func writeClipboardText(text string) error {
	text = strings.ReplaceAll(text, "\x00", "")
	utf16Text, err := windows.UTF16FromString(text)
	if err != nil {
		return fmt.Errorf("encode clipboard text: %w", err)
	}

	size := uintptr(len(utf16Text) * 2)
	memory, _, callErr := procGlobalAlloc.Call(gmemMoveable, size)
	if memory == 0 {
		return fmt.Errorf("GlobalAlloc: %w", winError(callErr))
	}

	owned := true
	defer func() {
		if owned {
			procGlobalFree.Call(memory)
		}
	}()

	ptr, _, callErr := procGlobalLock.Call(memory)
	if ptr == 0 {
		return fmt.Errorf("GlobalLock: %w", winError(callErr))
	}
	copy(unsafe.Slice((*uint16)(unsafe.Pointer(ptr)), len(utf16Text)), utf16Text)
	procGlobalUnlock.Call(memory)

	err = withClipboard(func() error {
		if ok, _, e := procEmptyClipboard.Call(); ok == 0 {
			return fmt.Errorf("EmptyClipboard: %w", winError(e))
		}
		if ok, _, e := procSetClipboardData.Call(cfUnicodeText, memory); ok == 0 {
			return fmt.Errorf("SetClipboardData: %w", winError(e))
		}
		return nil
	})
	if err != nil {
		return err
	}

	// The clipboard now owns the memory.
	owned = false
	return nil
}

func clipboardSequence() uint32 {
	sequence, _, _ := procGetClipboardSequenceNumber.Call()
	return uint32(sequence)
}

func foregroundProcessName() (string, error) {
	hwnd := windows.GetForegroundWindow()
	if hwnd == 0 {
		return "", errors.New("no foreground window")
	}

	var processID uint32
	procGetWindowThreadProcessId.Call(uintptr(hwnd), uintptr(unsafe.Pointer(&processID)))
	if processID == 0 {
		return "", errors.New("foreground window has no process")
	}

	process, err := windows.OpenProcess(processQuery, false, processID)
	if err != nil {
		return "", fmt.Errorf("OpenProcess(%d): %w", processID, err)
	}
	defer windows.CloseHandle(process)

	buffer := make([]uint16, 32768)
	size := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(process, 0, &buffer[0], &size); err != nil {
		return "", fmt.Errorf("QueryFullProcessImageName: %w", err)
	}

	fullPath := windows.UTF16ToString(buffer[:size])
	name := filepath.Base(fullPath)
	name = strings.TrimSuffix(name, filepath.Ext(name))
	return strings.ToLower(name), nil
}

func waitForModifiersReleased(timeout time.Duration) bool {
	// Ctrl, Alt, Shift, LWin, RWin.
	keys := []uintptr{0x11, 0x12, 0x10, 0x5B, 0x5C}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		down := false
		for _, key := range keys {
			state, _, _ := procGetAsyncKeyState.Call(key)
			if state&0x8000 != 0 {
				down = true
				break
			}
		}
		if !down {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return false
}

func openURL(target string) error {
	verb, err := windows.UTF16PtrFromString("open")
	if err != nil {
		return err
	}
	file, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	if err := windows.ShellExecute(0, verb, file, nil, nil, swShownormal); err != nil {
		return fmt.Errorf("ShellExecute: %w", err)
	}
	return nil
}

func beep() {
	procMessageBeep.Call(0x00000040) // MB_ICONASTERISK
}
