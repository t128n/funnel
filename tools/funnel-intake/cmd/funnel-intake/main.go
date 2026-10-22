package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"

	intake "github.com/t128n/funnel/tools/funnel-intake"
)

var version = "dev"

func main() {
	os.Exit(runMain())
}

func runMain() int {
	flags := flag.NewFlagSet("funnel-intake", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	configPath := flags.String("config", intake.DefaultConfigPath(), "path to the JSON config file")
	urlFlag := flags.String("url", "", "Funnel base URL (overrides FUNNEL_URL and the config file)")
	hotkeyFlag := flags.String("hotkey", "", "global hotkey such as Ctrl+Alt+I (overrides FUNNEL_HOTKEY and the config file)")
	sourceFlag := flags.String("source", "", "fixed source label (overrides FUNNEL_SOURCE and foreground detection)")
	debugFlag := flags.Bool("debug", false, "also write logs to stderr when a console is attached")
	checkFlag := flags.Bool("check", false, "validate the configuration and exit")
	testFlag := flags.Bool("test", false, "capture the current selection once, print the prefill, and exit")
	dryRunFlag := flags.Bool("dry-run", false, "log what would be opened instead of launching a browser")
	versionFlag := flags.Bool("version", false, "print the version and exit")

	if err := flags.Parse(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			showInfo("Funnel Intake", usage(flags))
			return 0
		}
		showError("Funnel Intake", err.Error())
		return 2
	}

	if *versionFlag {
		fmt.Println(versionString())
		return 0
	}

	cfg, err := intake.LoadConfig(*configPath)
	if err != nil {
		return fail(nil, err)
	}
	if *urlFlag != "" {
		cfg.BaseURL = *urlFlag
	}
	if *hotkeyFlag != "" {
		cfg.Hotkey = *hotkeyFlag
	}
	if *sourceFlag != "" {
		cfg.Source = *sourceFlag
	}
	if err := cfg.Normalize(); err != nil {
		return fail(nil, err)
	}
	cfg.DryRun = *dryRunFlag

	if *checkFlag {
		fmt.Printf("config=%s\nurl=%s\nhotkey=%s\nsource=%q\n", *configPath, cfg.BaseURL, cfg.Hotkey, cfg.Source)
		return 0
	}

	logger, closeLog, logErr := newLogger(filepath.Dir(*configPath), *debugFlag)
	defer closeLog()
	if logErr != nil {
		logger.Printf("log file unavailable: %v", logErr)
	}
	cfg.Logger = logger

	if *testFlag {
		prefill, target, truncated, err := intake.Preview(cfg)
		fmt.Printf("source=%s\ntitle=%q\nbody=%d chars\ntruncated=%t\nurl=%s\n",
			prefill.Source, prefill.Title, len([]rune(prefill.Body)), truncated, target)
		if err != nil {
			return fail(logger, err)
		}
		return 0
	}

	release, firstInstance, err := acquireSingleInstance()
	if err != nil {
		return fail(logger, err)
	}
	if !firstInstance {
		logger.Printf("another instance is already running; exiting")
		return 0
	}
	defer release()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := intake.Run(ctx, cfg); err != nil {
		if errors.Is(err, context.Canceled) {
			logger.Printf("stopped")
			return 0
		}
		return fail(logger, err)
	}
	return 0
}

func usage(flags *flag.FlagSet) string {
	var buffer bytes.Buffer
	buffer.WriteString("Funnel Intake - global hotkey for the intake form.\n\n")
	buffer.WriteString("Usage: funnel-intake [options]\n\nOptions:\n")
	flags.SetOutput(&buffer)
	flags.PrintDefaults()
	return buffer.String()
}

func fail(logger *log.Logger, err error) int {
	if logger != nil {
		logger.Printf("fatal: %v", err)
	}
	showError("Funnel Intake", err.Error())
	return 1
}

func versionString() string {
	if version != "dev" {
		return version
	}
	if info, ok := debug.ReadBuildInfo(); ok && info.Main.Version != "" && info.Main.Version != "(devel)" {
		return info.Main.Version
	}
	return version
}

func newLogger(dir string, debug bool) (*log.Logger, func(), error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return log.New(os.Stderr, "", log.LstdFlags), func() {}, fmt.Errorf("create %s: %w", dir, err)
	}

	path := filepath.Join(dir, "intake.log")
	rotateLog(path, 1<<20)

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return log.New(os.Stderr, "", log.LstdFlags), func() {}, fmt.Errorf("open %s: %w", path, err)
	}

	var writer io.Writer = file
	if debug {
		writer = io.MultiWriter(file, os.Stderr)
	}
	return log.New(writer, "", log.LstdFlags), func() { _ = file.Close() }, nil
}

func rotateLog(path string, maxSize int64) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxSize {
		return
	}
	_ = os.Remove(path + ".old")
	_ = os.Rename(path, path+".old")
}
