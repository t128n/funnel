//go:build !windows

package intake

import "context"

func run(ctx context.Context, cfg Config) error {
	return ErrUnsupported
}

// Preview is the non-Windows stub for the capture preview.
func Preview(cfg Config) (Prefill, string, bool, error) {
	return Prefill{}, "", false, ErrUnsupported
}
