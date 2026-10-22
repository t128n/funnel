package intake

import (
	"bytes"
	"compress/flate"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/url"
	"strings"
	"testing"
)

func TestEncodeQueryPrefersPlainForSmallPayloads(t *testing.T) {
	query, truncated, err := EncodeQuery(Prefill{Title: "Hello", Source: "chat"})
	if err != nil {
		t.Fatalf("EncodeQuery returned error: %v", err)
	}
	if truncated {
		t.Fatal("small payload should not be truncated")
	}
	if strings.HasPrefix(query, "d=") {
		t.Fatalf("query = %q, want the plain form", query)
	}

	values, err := url.ParseQuery(query)
	if err != nil {
		t.Fatalf("ParseQuery: %v", err)
	}
	if values.Get("title") != "Hello" || values.Get("source") != "chat" {
		t.Fatalf("query = %q, want title and source", query)
	}
}

func TestEncodeQueryUsesCompressedDeeplink(t *testing.T) {
	body := strings.Repeat("the quick brown fox jumps over the lazy dog\n", 400)
	query, truncated, err := EncodeQuery(Prefill{Title: "Long", Body: body, Source: "chat"})
	if err != nil {
		t.Fatalf("EncodeQuery returned error: %v", err)
	}
	if truncated {
		t.Fatal("repetitive body should fit without trimming")
	}
	if !strings.HasPrefix(query, "d=") {
		t.Fatalf("query does not use the compact deeplink: %q", query[:min(len(query), 40)])
	}
	if len(query) > DeeplinkMax {
		t.Fatalf("query length = %d, want <= %d", len(query), DeeplinkMax)
	}

	payload := decodeDeeplink(t, strings.TrimPrefix(query, "d="))
	if payload.Body != body {
		t.Fatalf("decoded body length = %d, want %d", len(payload.Body), len(body))
	}
	if payload.Title != "Long" || payload.Source != "chat" {
		t.Fatalf("decoded payload = %+v", payload)
	}
}

func TestEncodeQueryTrimsOversizedBody(t *testing.T) {
	body := randomASCII(t, BodyMax)
	query, truncated, err := EncodeQuery(Prefill{Title: "Huge", Body: body, Source: "chat"})
	if err != nil {
		t.Fatalf("EncodeQuery returned error: %v", err)
	}
	if !truncated {
		t.Fatal("incompressible oversized body should be trimmed")
	}
	if len(query) > DeeplinkMax {
		t.Fatalf("query length = %d, want <= %d", len(query), DeeplinkMax)
	}

	payload := decodeQuery(t, query)
	if len(payload.Body) == 0 || len(payload.Body) >= len(body) {
		t.Fatalf("decoded body length = %d, want a non-empty prefix of %d", len(payload.Body), len(body))
	}
	if payload.Title != "Huge" {
		t.Fatalf("decoded title = %q, want Huge", payload.Title)
	}
}

func TestBuildURL(t *testing.T) {
	tests := []struct {
		base string
		want string
	}{
		{"http://localhost:3000", "http://localhost:3000/intake?source=chat"},
		{"http://localhost:3000/", "http://localhost:3000/intake?source=chat"},
		{"https://funnel.example.com/funnel/", "https://funnel.example.com/funnel/intake?source=chat"},
	}

	for _, test := range tests {
		got, _, err := BuildURL(test.base, Prefill{Source: "chat"})
		if err != nil {
			t.Fatalf("BuildURL(%q) returned error: %v", test.base, err)
		}
		if got != test.want {
			t.Errorf("BuildURL(%q) = %q, want %q", test.base, got, test.want)
		}
	}
}

func TestBuildURLRejectsBadBase(t *testing.T) {
	bad := []string{"", "ftp://example.com", "http://", "https://example.com?a=1", "https://example.com#frag"}
	for _, base := range bad {
		if _, _, err := BuildURL(base, Prefill{Source: "chat"}); err == nil {
			t.Errorf("BuildURL(%q) succeeded, want error", base)
		}
	}
}

func decodeQuery(t *testing.T, query string) deeplinkPayload {
	t.Helper()
	if strings.HasPrefix(query, "d=") {
		return decodeDeeplink(t, strings.TrimPrefix(query, "d="))
	}
	values, err := url.ParseQuery(query)
	if err != nil {
		t.Fatalf("ParseQuery(%q): %v", query, err)
	}
	return deeplinkPayload{
		Title:  values.Get("title"),
		Body:   values.Get("body"),
		Source: values.Get("source"),
	}
}

func decodeDeeplink(t *testing.T, encoded string) deeplinkPayload {
	t.Helper()
	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("base64 decode: %v", err)
	}
	reader := flate.NewReader(bytes.NewReader(raw))
	defer reader.Close()
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("inflate: %v", err)
	}
	var payload deeplinkPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("json decode %q: %v", data, err)
	}
	return payload
}

func randomASCII(t *testing.T, size int) string {
	t.Helper()
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	buffer := make([]byte, size)
	if _, err := rand.Read(buffer); err != nil {
		t.Fatalf("rand.Read: %v", err)
	}
	for i, value := range buffer {
		buffer[i] = alphabet[int(value)%len(alphabet)]
	}
	return string(buffer)
}
