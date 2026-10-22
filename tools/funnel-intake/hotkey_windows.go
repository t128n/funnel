//go:build windows

package intake

import (
	"context"
	"fmt"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

// listenHotkey registers the hotkey on a dedicated OS thread and pumps the
// thread's message queue until ctx is cancelled or an error occurs. Registering
// without a window associates the hotkey with the calling thread, so the thread
// must stay locked and alive for the whole loop.
func listenHotkey(ctx context.Context, hotkey Hotkey, onHotkey func()) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	const id = 1
	modifiers := uintptr(hotkey.Modifiers | modNoRepeat)
	registered, _, err := procRegisterHotKey.Call(0, id, modifiers, uintptr(hotkey.VirtualKey))
	if registered == 0 {
		return fmt.Errorf("RegisterHotKey(%s): %w", hotkey, winError(err))
	}
	defer procUnregisterHotKey.Call(0, id)

	threadID := windows.GetCurrentThreadId()
	stop := make(chan struct{})
	exited := make(chan struct{})
	go func() {
		defer close(exited)
		select {
		case <-ctx.Done():
			procPostThreadMessageW.Call(uintptr(threadID), wmQuit, 0, 0)
		case <-stop:
		}
	}()
	defer func() {
		close(stop)
		<-exited
	}()

	var message winMsg
	for {
		result, _, err := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		switch int32(result) {
		case -1:
			return fmt.Errorf("GetMessageW: %w", winError(err))
		case 0:
			return ctx.Err()
		}

		if message.message == wmHotkey && message.wParam == id {
			onHotkey()
			continue
		}

		procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}
}
