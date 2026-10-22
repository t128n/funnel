//go:build windows

package main

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32         = windows.NewLazySystemDLL("kernel32.dll")
	procCreateMutexW = kernel32.NewProc("CreateMutexW")
)

// acquireSingleInstance creates (or opens) a per-session named mutex. It
// returns first=false when another instance already holds it.
func acquireSingleInstance() (func(), bool, error) {
	name, err := windows.UTF16PtrFromString(`Local\FunnelIntake`)
	if err != nil {
		return nil, false, err
	}

	handle, _, callErr := procCreateMutexW.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if handle == 0 {
		return nil, false, fmt.Errorf("CreateMutex: %w", callError(callErr))
	}

	if errors.Is(callErr, windows.ERROR_ALREADY_EXISTS) {
		_ = windows.CloseHandle(windows.Handle(handle))
		return nil, false, nil
	}

	return func() { _ = windows.CloseHandle(windows.Handle(handle)) }, true, nil
}

func callError(err error) error {
	if err == nil || errors.Is(err, syscall.Errno(0)) {
		return errors.New("Windows call failed")
	}
	return err
}
