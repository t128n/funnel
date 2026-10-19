package intake

import (
	"testing"
)

func TestParseHotkeyValid(t *testing.T) {
	tests := []struct {
		input     string
		virtual   uint32
		modifiers Modifiers
		canonical string
	}{
		{"Ctrl+Alt+I", 'I', ModControl | ModAlt, "Ctrl+Alt+I"},
		{"ctrl+shift+f12", 0x7B, ModControl | ModShift, "Ctrl+Shift+F12"},
		{"Win+Space", vkSpace, ModWin, "Win+Space"},
		{"Alt+F4", 0x73, ModAlt, "Alt+F4"},
		{"Ctrl+Alt+Plus", vkOEMPlus, ModControl | ModAlt, "Ctrl+Alt+Plus"},
		{"Shift+Ctrl+Enter", vkReturn, ModControl | ModShift, "Ctrl+Shift+Enter"},
		{" meta + alt + 7 ", '7', ModAlt | ModWin, "Alt+Win+7"},
		{"Ctrl+Alt+Numpad5", 0x65, ModControl | ModAlt, "Ctrl+Alt+Numpad5"},
	}

	for _, test := range tests {
		t.Run(test.input, func(t *testing.T) {
			hotkey, err := ParseHotkey(test.input)
			if err != nil {
				t.Fatalf("ParseHotkey(%q) returned error: %v", test.input, err)
			}
			if hotkey.VirtualKey != test.virtual {
				t.Errorf("VirtualKey = %#x, want %#x", hotkey.VirtualKey, test.virtual)
			}
			if hotkey.Modifiers != test.modifiers {
				t.Errorf("Modifiers = %#x, want %#x", hotkey.Modifiers, test.modifiers)
			}
			if got := hotkey.String(); got != test.canonical {
				t.Errorf("String() = %q, want %q", got, test.canonical)
			}
		})
	}
}

func TestParseHotkeyInvalid(t *testing.T) {
	inputs := []string{
		"",
		"I",
		"Ctrl",
		"Ctrl+I+J",
		"Ctrl+Ctrl+I",
		"Ctrl++",
		"Ctrl+Unknown",
		"Ctrl+F25",
		"Ctrl+",
	}
	for _, input := range inputs {
		if _, err := ParseHotkey(input); err == nil {
			t.Errorf("ParseHotkey(%q) succeeded, want error", input)
		}
	}
}
