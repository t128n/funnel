package intake

import (
	"strings"
	"unicode/utf16"
)

// Limits mirror src/lib/intake-prefill.ts. Keep them in sync; the Go helper and
// the web composer must agree on what fits.
const (
	TitleMax    = 256
	BodyMax     = 65_536
	SourceMax   = 128
	DeeplinkMax = 8_000
)

// Prefill is the concrete payload that ends up in the intake query string.
type Prefill struct {
	Title  string
	Body   string
	Source string
}

var knownSources = map[string]string{
	"email":        "email",
	"chat":         "chat",
	"meeting":      "meeting",
	"walk-in":      "walk-in",
	"self-service": "self-service",
}

// BuildPrefill maps a captured selection to the form fields.
//
// The title is the first non-empty line with whitespace collapsed; the body is
// the full selection. Values are clamped by UTF-16 code units so the limits
// match the JavaScript implementation. An empty selection yields an empty
// title/body plus the source, which opens a blank but labelled form.
func BuildPrefill(selection, source string) Prefill {
	source = clampUTF16(normalizeSource(source), SourceMax)

	if strings.TrimSpace(selection) == "" {
		return Prefill{Source: source}
	}

	title := firstLine(selection)

	return Prefill{
		Title:  clampUTF16(title, TitleMax),
		Body:   clampUTF16(selection, BodyMax),
		Source: source,
	}
}

// ClampPrefill applies the shared limits to already-built values.
func ClampPrefill(p Prefill) Prefill {
	return Prefill{
		Title:  clampUTF16(strings.TrimSpace(p.Title), TitleMax),
		Body:   clampUTF16(p.Body, BodyMax),
		Source: clampUTF16(normalizeSource(p.Source), SourceMax),
	}
}

// SourceForProcess maps a foreground process name onto an intake source. The
// sourceMap is checked first (keys are process names without .exe); otherwise
// the process name itself is used, matching the old PowerShell helper.
func SourceForProcess(process string, sourceMap map[string]string) string {
	key := normalizeProcessName(process)
	if key == "" {
		return "unknown"
	}
	if sourceMap != nil {
		if value, ok := sourceMap[key]; ok {
			return normalizeSource(value)
		}
	}
	if value, ok := builtinSourceMap[key]; ok {
		return normalizeSource(value)
	}
	return normalizeSource(key)
}

func normalizeProcessName(process string) string {
	name := strings.ToLower(strings.TrimSpace(process))
	name = strings.TrimSuffix(name, ".exe")
	return name
}

func normalizeSource(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if canonical, ok := knownSources[strings.ToLower(value)]; ok {
		return canonical
	}
	return value
}

func firstLine(text string) string {
	for _, line := range strings.FieldsFunc(text, func(r rune) bool {
		return r == '\r' || r == '\n'
	}) {
		if collapsed := strings.Join(strings.Fields(line), " "); collapsed != "" {
			return collapsed
		}
	}
	return ""
}

// clampUTF16 truncates s to at most max UTF-16 code units, never splitting a
// surrogate pair. JavaScript's String.prototype.slice counts code units, so
// this keeps the values the web page sees identical to what Go sends.
func clampUTF16(s string, max int) string {
	if max <= 0 {
		return ""
	}
	units := 0
	for i, r := range s {
		n := utf16.RuneLen(r)
		if units+n > max {
			return s[:i]
		}
		units += n
	}
	return s
}

func truncateUTF16(s string, max int) string {
	return clampUTF16(s, max)
}

func utf16Length(s string) int {
	units := 0
	for _, r := range s {
		units += utf16.RuneLen(r)
	}
	return units
}
