//go:build windows

package main

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	mbOK            = 0x00000000
	mbIconError     = 0x00000010
	mbIconInfo      = 0x00000040
	mbSetForeground = 0x00010000
	mbTopmost       = 0x00040000
)

var (
	dialogUser32    = windows.NewLazySystemDLL("user32.dll")
	procMessageBoxW = dialogUser32.NewProc("MessageBoxW")
)

func showError(title, text string) {
	messageBox(title, text, mbOK|mbIconError|mbSetForeground|mbTopmost)
}

func showInfo(title, text string) {
	messageBox(title, text, mbOK|mbIconInfo|mbSetForeground|mbTopmost)
}

func messageBox(title, text string, flags uint32) {
	titlePtr, err := windows.UTF16PtrFromString(title)
	if err != nil {
		return
	}
	textPtr, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return
	}
	procMessageBoxW.Call(
		0,
		uintptr(unsafe.Pointer(textPtr)),
		uintptr(unsafe.Pointer(titlePtr)),
		uintptr(flags),
	)
}
