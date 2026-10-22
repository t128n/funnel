package intake

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// Modifiers is a bit mask of the Windows MOD_* hotkey flags.
type Modifiers uint32

const (
	ModAlt     Modifiers = 0x0001
	ModControl Modifiers = 0x0002
	ModShift   Modifiers = 0x0004
	ModWin     Modifiers = 0x0008

	// modNoRepeat suppresses auto-repeat while the key is held.
	modNoRepeat Modifiers = 0x4000
)

// Virtual-key codes used by the parser. Keeping them here makes the parser
// testable on every OS.
const (
	vkBack      = 0x08
	vkTab       = 0x09
	vkReturn    = 0x0D
	vkPause     = 0x13
	vkEscape    = 0x1B
	vkSpace     = 0x20
	vkPageUp    = 0x21
	vkPageDown  = 0x22
	vkEnd       = 0x23
	vkHome      = 0x24
	vkLeft      = 0x25
	vkUp        = 0x26
	vkRight     = 0x27
	vkDown      = 0x28
	vkPrint     = 0x2C
	vkInsert    = 0x2D
	vkDelete    = 0x2E
	vkOEM1      = 0xBA // ;:
	vkOEMPlus   = 0xBB // =+
	vkOEMComma  = 0xBC // ,<
	vkOEMMinus  = 0xBD // -_
	vkOEMPeriod = 0xBE // .>
	vkOEM2      = 0xBF // /?
	vkOEM3      = 0xC0 // `~
	vkOEM4      = 0xDB // [{
	vkOEM5      = 0xDC // \|
	vkOEM6      = 0xDD // ]}
	vkOEM7      = 0xDE // '"
)

// Hotkey is a parsed global hotkey.
type Hotkey struct {
	Modifiers  Modifiers
	VirtualKey uint32
	Key        string
}

// String returns the canonical Ctrl+Alt+Shift+Win+Key form.
func (h Hotkey) String() string {
	parts := make([]string, 0, 5)
	if h.Modifiers&ModControl != 0 {
		parts = append(parts, "Ctrl")
	}
	if h.Modifiers&ModAlt != 0 {
		parts = append(parts, "Alt")
	}
	if h.Modifiers&ModShift != 0 {
		parts = append(parts, "Shift")
	}
	if h.Modifiers&ModWin != 0 {
		parts = append(parts, "Win")
	}
	parts = append(parts, h.Key)
	return strings.Join(parts, "+")
}

// ParseHotkey parses a hotkey such as "Ctrl+Alt+I", "Win+Shift+F12", or
// "Ctrl+Alt+Space". At least one modifier is required; a bare key would be too
// easy to trigger accidentally.
func ParseHotkey(input string) (Hotkey, error) {
	raw := strings.TrimSpace(input)
	if raw == "" {
		return Hotkey{}, fmt.Errorf("hotkey is empty")
	}

	var (
		mods     Modifiers
		vk       uint32
		key      string
		haveKey  bool
		parts    = strings.Split(raw, "+")
		sawMod   bool
		modNames = make(map[Modifiers]string, 4)
	)

	if len(parts) < 2 {
		return Hotkey{}, fmt.Errorf("hotkey %q needs a modifier (for example Ctrl+Alt+I)", input)
	}

	for _, part := range parts {
		token := strings.TrimSpace(part)
		if token == "" {
			return Hotkey{}, fmt.Errorf("hotkey %q contains an empty part", input)
		}

		if mod, ok := parseModifier(token); ok {
			if prev, duplicate := modNames[mod]; duplicate {
				return Hotkey{}, fmt.Errorf("hotkey %q repeats modifier %s", input, prev)
			}
			modNames[mod] = token
			mods |= mod
			sawMod = true
			continue
		}

		if haveKey {
			return Hotkey{}, fmt.Errorf("hotkey %q contains more than one key", input)
		}
		parsed, canonical, err := parseVirtualKey(token)
		if err != nil {
			return Hotkey{}, fmt.Errorf("hotkey %q: %w", input, err)
		}
		vk, key, haveKey = parsed, canonical, true
	}

	if !sawMod {
		return Hotkey{}, fmt.Errorf("hotkey %q needs a modifier (for example Ctrl+Alt+I)", input)
	}
	if !haveKey {
		return Hotkey{}, fmt.Errorf("hotkey %q has no key", input)
	}

	return Hotkey{Modifiers: mods, VirtualKey: vk, Key: key}, nil
}

func parseModifier(token string) (Modifiers, bool) {
	switch strings.ToLower(token) {
	case "ctrl", "control":
		return ModControl, true
	case "alt":
		return ModAlt, true
	case "shift":
		return ModShift, true
	case "win", "windows", "meta", "super":
		return ModWin, true
	default:
		return 0, false
	}
}

type namedKey struct {
	vk   uint32
	name string
}

var namedKeys = map[string]namedKey{
	"BACKSPACE":    {vkBack, "Backspace"},
	"TAB":          {vkTab, "Tab"},
	"ENTER":        {vkReturn, "Enter"},
	"RETURN":       {vkReturn, "Enter"},
	"PAUSE":        {vkPause, "Pause"},
	"BREAK":        {vkPause, "Pause"},
	"ESC":          {vkEscape, "Esc"},
	"ESCAPE":       {vkEscape, "Esc"},
	"SPACE":        {vkSpace, "Space"},
	"PAGEUP":       {vkPageUp, "PageUp"},
	"PGUP":         {vkPageUp, "PageUp"},
	"PAGEDOWN":     {vkPageDown, "PageDown"},
	"PGDN":         {vkPageDown, "PageDown"},
	"END":          {vkEnd, "End"},
	"HOME":         {vkHome, "Home"},
	"LEFT":         {vkLeft, "Left"},
	"UP":           {vkUp, "Up"},
	"RIGHT":        {vkRight, "Right"},
	"DOWN":         {vkDown, "Down"},
	"PRINTSCREEN":  {vkPrint, "PrintScreen"},
	"PRTSC":        {vkPrint, "PrintScreen"},
	"INSERT":       {vkInsert, "Insert"},
	"INS":          {vkInsert, "Insert"},
	"DELETE":       {vkDelete, "Delete"},
	"DEL":          {vkDelete, "Delete"},
	"PLUS":         {vkOEMPlus, "Plus"},
	"EQUAL":        {vkOEMPlus, "Equal"},
	"MINUS":        {vkOEMMinus, "Minus"},
	"COMMA":        {vkOEMComma, "Comma"},
	"PERIOD":       {vkOEMPeriod, "Period"},
	"SLASH":        {vkOEM2, "Slash"},
	"BACKSLASH":    {vkOEM5, "Backslash"},
	"SEMICOLON":    {vkOEM1, "Semicolon"},
	"QUOTE":        {vkOEM7, "Quote"},
	"BACKTICK":     {vkOEM3, "Backtick"},
	"GRAVE":        {vkOEM3, "Backtick"},
	"BRACKETLEFT":  {vkOEM4, "BracketLeft"},
	"BRACKETRIGHT": {vkOEM6, "BracketRight"},
}

func parseVirtualKey(token string) (uint32, string, error) {
	upper := strings.ToUpper(token)

	if named, ok := namedKeys[upper]; ok {
		return named.vk, named.name, nil
	}

	runes := []rune(token)
	if len(runes) == 1 {
		r := unicode.ToUpper(runes[0])
		switch {
		case r >= 'A' && r <= 'Z':
			return uint32(r), string(r), nil
		case r >= '0' && r <= '9':
			return uint32(r), string(r), nil
		}
	}

	if strings.HasPrefix(upper, "NUMPAD") {
		rest := strings.TrimPrefix(upper, "NUMPAD")
		if n, err := strconv.Atoi(rest); err == nil && n >= 0 && n <= 9 {
			return uint32(0x60 + n), fmt.Sprintf("Numpad%d", n), nil
		}
		switch rest {
		case "ADD", "PLUS":
			return 0x6B, "NumpadAdd", nil
		case "SUBTRACT", "MINUS":
			return 0x6D, "NumpadSubtract", nil
		case "MULTIPLY":
			return 0x6A, "NumpadMultiply", nil
		case "DIVIDE":
			return 0x6F, "NumpadDivide", nil
		case "DECIMAL", "PERIOD":
			return 0x6E, "NumpadDecimal", nil
		}
	}

	if strings.HasPrefix(upper, "F") {
		if n, err := strconv.Atoi(upper[1:]); err == nil && n >= 1 && n <= 24 {
			return uint32(0x70 + n - 1), fmt.Sprintf("F%d", n), nil
		}
	}

	return 0, "", fmt.Errorf("unsupported key %q", token)
}
