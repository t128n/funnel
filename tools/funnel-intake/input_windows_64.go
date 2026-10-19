//go:build windows && (amd64 || arm64)

package intake

import (
	"fmt"
	"unsafe"
)

// keyboardInput and input mirror the Win32 KEYBDINPUT / INPUT structures. The
// trailing padding makes the union 32 bytes (the size of MOUSEINPUT), which is
// what SendInput validates against.
type keyboardInput struct {
	wVk         uint16
	wScan       uint16
	dwFlags     uint32
	time        uint32
	dwExtraInfo uintptr
}

type input struct {
	typ uint32
	_   uint32
	ki  keyboardInput
	_   [8]byte
}

const inputKeyboard = 1

func sendCopy() error {
	inputs := [...]input{
		{typ: inputKeyboard, ki: keyboardInput{wVk: 0x11}},                          // Ctrl down
		{typ: inputKeyboard, ki: keyboardInput{wVk: 0x43}},                          // C down
		{typ: inputKeyboard, ki: keyboardInput{wVk: 0x43, dwFlags: keyeventfKeyUp}}, // C up
		{typ: inputKeyboard, ki: keyboardInput{wVk: 0x11, dwFlags: keyeventfKeyUp}}, // Ctrl up
	}

	count, _, err := procSendInput.Call(
		uintptr(len(inputs)),
		uintptr(unsafe.Pointer(&inputs[0])),
		unsafe.Sizeof(inputs[0]),
	)
	if count != uintptr(len(inputs)) {
		return fmt.Errorf("SendInput: %w", winError(err))
	}
	return nil
}
