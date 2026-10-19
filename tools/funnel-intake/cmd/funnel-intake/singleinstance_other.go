//go:build !windows

package main

func acquireSingleInstance() (func(), bool, error) {
	return func() {}, true, nil
}
