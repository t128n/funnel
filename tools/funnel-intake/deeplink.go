package intake

import (
	"bytes"
	"compress/flate"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// EncodeQuery mirrors src/lib/client/intake-deeplink.ts: it emits either the
// plain title/body/source parameters or the compact
// `d=base64url(deflate-raw({"t":…,"b":…,"s":…}))` form, whichever is shorter.
// The returned bool reports whether the body had to be trimmed to fit
// DeeplinkMax.
func EncodeQuery(p Prefill) (string, bool, error) {
	p = ClampPrefill(p)

	query, err := encodeExact(p)
	if err != nil {
		return "", false, err
	}
	if len(query) <= DeeplinkMax {
		return query, false, nil
	}

	originalBody := p.Body
	totalUnits := utf16Length(originalBody)
	best := -1

	// Deflate output grows with the input in practice; binary search the
	// longest prefix that still fits. Every candidate is verified, so a
	// non-monotonic block boundary only costs a few bytes, not correctness.
	low, high := 0, totalUnits
	for low <= high {
		mid := low + (high-low)/2
		candidate := p
		candidate.Body = truncateUTF16(originalBody, mid)
		encoded, err := encodeExact(candidate)
		if err != nil {
			return "", false, err
		}
		if len(encoded) <= DeeplinkMax {
			best = mid
			low = mid + 1
		} else {
			high = mid - 1
		}
	}

	if best < 0 {
		return "", false, fmt.Errorf("title and source do not fit in a %d-character deeplink", DeeplinkMax)
	}

	p.Body = truncateUTF16(originalBody, best)
	query, err = encodeExact(p)
	if err != nil {
		return "", false, err
	}
	if len(query) > DeeplinkMax {
		return "", false, fmt.Errorf("encoded deeplink is %d characters (max %d)", len(query), DeeplinkMax)
	}

	return query, best < totalUnits, nil
}

func encodeExact(p Prefill) (string, error) {
	plain := encodePlain(p)
	payload := deeplinkPayload{
		Title:  p.Title,
		Body:   p.Body,
		Source: p.Source,
	}
	if payload.Title == "" && payload.Body == "" && payload.Source == "" {
		return "", nil
	}

	jsonBytes, err := marshalPayload(payload)
	if err != nil {
		return "", err
	}

	var compressed bytes.Buffer
	writer, err := flate.NewWriter(&compressed, flate.DefaultCompression)
	if err != nil {
		return "", fmt.Errorf("deflate: %w", err)
	}
	if _, err := writer.Write(jsonBytes); err != nil {
		_ = writer.Close()
		return "", fmt.Errorf("deflate: %w", err)
	}
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("deflate: %w", err)
	}

	compact := "d=" + base64.RawURLEncoding.EncodeToString(compressed.Bytes())
	if len(compact) < len(plain) {
		return compact, nil
	}
	return plain, nil
}

type deeplinkPayload struct {
	Title  string `json:"t,omitempty"`
	Body   string `json:"b,omitempty"`
	Source string `json:"s,omitempty"`
}

func marshalPayload(payload deeplinkPayload) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(payload); err != nil {
		return nil, err
	}
	// encoding/json appends a newline; JSON.parse tolerates it, but removing it
	// keeps the compressed payload byte-for-byte close to JSON.stringify.
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}

func encodePlain(p Prefill) string {
	values := url.Values{}
	if p.Title != "" {
		values.Set("title", p.Title)
	}
	if p.Body != "" {
		values.Set("body", p.Body)
	}
	if p.Source != "" {
		values.Set("source", p.Source)
	}
	return values.Encode()
}

// ErrNoIntake is returned when a URL cannot be formed.
var ErrNoIntake = errors.New("cannot build intake URL")

// BuildURL appends /intake to baseURL and attaches the shortest query string
// for the prefill. The bool reports whether the body was trimmed.
func BuildURL(baseURL string, p Prefill) (string, bool, error) {
	normalized, err := normalizeBaseURL(baseURL)
	if err != nil {
		return "", false, err
	}

	parsed, err := url.Parse(normalized)
	if err != nil {
		return "", false, fmt.Errorf("%w: %v", ErrNoIntake, err)
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/intake"
	parsed.RawPath = ""

	query, truncated, err := EncodeQuery(p)
	if err != nil {
		return "", false, err
	}
	parsed.RawQuery = query
	parsed.ForceQuery = false

	return parsed.String(), truncated, nil
}

func normalizeBaseURL(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", errors.New("URL is empty")
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	if scheme := strings.ToLower(parsed.Scheme); scheme != "http" && scheme != "https" {
		return "", fmt.Errorf("URL must use http or https (got %q)", parsed.Scheme)
	}
	if parsed.Host == "" {
		return "", errors.New("URL has no host")
	}
	if parsed.RawQuery != "" || parsed.ForceQuery {
		return "", errors.New("URL must not include a query string")
	}
	if parsed.Fragment != "" {
		return "", errors.New("URL must not include a fragment")
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawPath = ""
	return parsed.String(), nil
}
