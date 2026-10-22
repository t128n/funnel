package intake

import (
	"strings"
	"testing"
)

func TestBuildPrefill(t *testing.T) {
	selection := "   \r\n  Fix the login   flow  \r\nsecond line\nthird"
	prefill := BuildPrefill(selection, "chat")

	if prefill.Title != "Fix the login flow" {
		t.Errorf("Title = %q, want %q", prefill.Title, "Fix the login flow")
	}
	if prefill.Body != selection {
		t.Errorf("Body = %q, want the untouched selection", prefill.Body)
	}
	if prefill.Source != "chat" {
		t.Errorf("Source = %q, want chat", prefill.Source)
	}
}

func TestBuildPrefillEmptySelection(t *testing.T) {
	prefill := BuildPrefill("   \n\t ", "email")
	if prefill.Title != "" {
		t.Errorf("Title = %q, want empty", prefill.Title)
	}
	if prefill.Body != "" {
		t.Errorf("Body = %q, want empty", prefill.Body)
	}
	if prefill.Source != "email" {
		t.Errorf("Source = %q, want email", prefill.Source)
	}
}

func TestBuildPrefillStripsLeadingBlankLines(t *testing.T) {
	prefill := BuildPrefill("\n\n   \nactual text", "unknown")
	if prefill.Title != "actual text" {
		t.Errorf("Title = %q, want %q", prefill.Title, "actual text")
	}
}

func TestClampPrefillLimits(t *testing.T) {
	longBody := strings.Repeat("a", BodyMax+10)
	prefill := ClampPrefill(Prefill{
		Title:  strings.Repeat("t", TitleMax+10),
		Body:   longBody,
		Source: strings.Repeat("s", SourceMax+10),
	})

	if got := len(prefill.Title); got != TitleMax {
		t.Errorf("title length = %d, want %d", got, TitleMax)
	}
	if got := len(prefill.Body); got != BodyMax {
		t.Errorf("body length = %d, want %d", got, BodyMax)
	}
	if got := len(prefill.Source); got != SourceMax {
		t.Errorf("source length = %d, want %d", got, SourceMax)
	}
}

func TestClampUTF16DoesNotSplitSurrogates(t *testing.T) {
	// "😀" is two UTF-16 code units.
	if got := clampUTF16("a😀b", 1); got != "a" {
		t.Errorf("clampUTF16(a😀b, 1) = %q, want %q", got, "a")
	}
	if got := clampUTF16("a😀b", 2); got != "a" {
		t.Errorf("clampUTF16(a😀b, 2) = %q, want %q", got, "a")
	}
	if got := clampUTF16("a😀b", 3); got != "a😀" {
		t.Errorf("clampUTF16(a😀b, 3) = %q, want %q", got, "a😀")
	}
	if got := utf16Length("a😀b"); got != 4 {
		t.Errorf("utf16Length(a😀b) = %d, want 4", got)
	}
}

func TestSourceForProcess(t *testing.T) {
	overrides := map[string]string{"msedge": "walk-in"}

	tests := []struct {
		process string
		want    string
	}{
		{"ms-teams", "chat"},
		{"Teams.exe", "chat"},
		{"OUTLOOK.EXE", "email"},
		{"Zoom", "meeting"},
		{"msedge.exe", "walk-in"},
		{"slack", "chat"},
		{"notepad", "notepad"},
		{"", "unknown"},
	}

	for _, test := range tests {
		if got := SourceForProcess(test.process, overrides); got != test.want {
			t.Errorf("SourceForProcess(%q) = %q, want %q", test.process, got, test.want)
		}
	}
}

func TestNormalizeSource(t *testing.T) {
	tests := map[string]string{
		"  Email ":     "email",
		"CHAT":         "chat",
		"Meeting":      "meeting",
		"walk-in":      "walk-in",
		"self-service": "self-service",
		"Slack":        "Slack",
		"":             "",
	}
	for input, want := range tests {
		if got := normalizeSource(input); got != want {
			t.Errorf("normalizeSource(%q) = %q, want %q", input, got, want)
		}
	}
}
