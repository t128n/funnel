//go:build windows && (amd64 || arm64)

package intake

import (
	"testing"
	"unsafe"
)

// SendInput validates cbSize against the SDK's INPUT size, so a wrong layout
// makes every copy silently fail. Pin the sizes on 64-bit Windows.
func TestWin32StructSizes(t *testing.T) {
	if size := unsafe.Sizeof(input{}); size != 40 {
		t.Fatalf("sizeof(INPUT) = %d, want 40", size)
	}
	if size := unsafe.Sizeof(winMsg{}); size != 48 {
		t.Fatalf("sizeof(MSG) = %d, want 48", size)
	}
}
