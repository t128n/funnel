//! `/intake` link encoding.
//!
//! Matches `src/lib/client/intake-deeplink.ts` and the original helper: the
//! shorter of the plain query and `d=base64url(deflate-raw(json))` wins.

use std::io::Write;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use flate2::Compression;
use flate2::write::DeflateEncoder;
use serde::{Deserialize, Serialize};

use crate::config::normalize_base_url;
use crate::prefill::{Prefill, clamp_prefill, truncate_utf16, utf16_length};

pub const DEEPLINK_MAX: usize = 8_000;

#[derive(Debug, Deserialize, Serialize)]
struct Payload {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    t: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    b: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    s: String,
}

/// Returns the query string and whether the body was trimmed to fit.
pub fn encode_query(prefill: Prefill) -> Result<(String, bool), String> {
    let prefill = clamp_prefill(prefill);
    let query = encode_exact(&prefill)?;
    if query.len() <= DEEPLINK_MAX {
        return Ok((query, false));
    }

    let original_body = prefill.body.clone();
    let total_units = utf16_length(&original_body);
    let mut best: Option<usize> = None;
    let mut low = 0usize;
    let mut high = total_units;

    while low <= high {
        let mid = low + (high - low) / 2;
        let mut candidate = prefill.clone();
        candidate.body = truncate_utf16(&original_body, mid).to_owned();
        let encoded = encode_exact(&candidate)?;
        if encoded.len() <= DEEPLINK_MAX {
            best = Some(mid);
            low = mid + 1;
        } else if mid == 0 {
            break;
        } else {
            high = mid - 1;
        }
    }

    let best = best.ok_or_else(|| {
        format!("title and source do not fit in a {DEEPLINK_MAX}-character deeplink")
    })?;
    let mut trimmed = prefill;
    trimmed.body = truncate_utf16(&original_body, best).to_owned();
    let query = encode_exact(&trimmed)?;
    if query.len() > DEEPLINK_MAX {
        return Err(format!(
            "encoded deeplink is {} characters (max {DEEPLINK_MAX})",
            query.len()
        ));
    }
    Ok((query, best < total_units))
}

fn encode_exact(prefill: &Prefill) -> Result<String, String> {
    let plain = encode_plain(prefill);
    let payload = Payload {
        t: prefill.title.clone(),
        b: prefill.body.clone(),
        s: prefill.source.clone(),
    };
    if payload.t.is_empty() && payload.b.is_empty() && payload.s.is_empty() {
        return Ok(String::new());
    }

    let json = serde_json::to_vec(&payload).map_err(|err| format!("encode deeplink: {err}"))?;
    let mut encoder = DeflateEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&json)
        .map_err(|err| format!("deflate: {err}"))?;
    let compressed = encoder.finish().map_err(|err| format!("deflate: {err}"))?;
    let compact = format!("d={}", URL_SAFE_NO_PAD.encode(compressed));
    if compact.len() < plain.len() {
        Ok(compact)
    } else {
        Ok(plain)
    }
}

fn encode_plain(prefill: &Prefill) -> String {
    let mut pairs = Vec::new();
    if !prefill.body.is_empty() {
        pairs.push(("body", prefill.body.as_str()));
    }
    if !prefill.source.is_empty() {
        pairs.push(("source", prefill.source.as_str()));
    }
    if !prefill.title.is_empty() {
        pairs.push(("title", prefill.title.as_str()));
    }
    pairs
        .into_iter()
        .map(|(key, value)| format!("{key}={}", query_escape(value)))
        .collect::<Vec<_>>()
        .join("&")
}

/// Go's `url.QueryEscape`: unreserved bytes stay, space becomes `+`, the rest
/// is `%XX` with uppercase hex.
pub fn query_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push('+'),
            _ => {
                use std::fmt::Write as _;
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
}

pub fn build_url(base_url: &str, prefill: Prefill) -> Result<(String, bool), String> {
    let base = normalize_base_url(base_url)?;
    let (query, truncated) = encode_query(prefill)?;
    let mut target = format!("{}/intake", base.trim_end_matches('/'));
    if !query.is_empty() {
        target.push('?');
        target.push_str(&query);
    }
    Ok((target, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::DeflateDecoder;
    use std::io::Read;

    fn decode_query(query: &str) -> Payload {
        if let Some(encoded) = query.strip_prefix("d=") {
            let raw = URL_SAFE_NO_PAD.decode(encoded).unwrap();
            let mut reader = DeflateDecoder::new(raw.as_slice());
            let mut data = Vec::new();
            reader.read_to_end(&mut data).unwrap();
            return serde_json::from_slice(&data).unwrap();
        }
        let mut payload = Payload {
            t: String::new(),
            b: String::new(),
            s: String::new(),
        };
        for pair in query.split('&') {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            let value = query_unescape(value);
            match key {
                "title" => payload.t = value,
                "body" => payload.b = value,
                "source" => payload.s = value,
                _ => {}
            }
        }
        payload
    }

    fn query_unescape(value: &str) -> String {
        let bytes = value.as_bytes();
        let mut out = Vec::new();
        let mut index = 0;
        while index < bytes.len() {
            match bytes[index] {
                b'+' => {
                    out.push(b' ');
                    index += 1;
                }
                b'%' if index + 2 < bytes.len() => {
                    let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap();
                    out.push(u8::from_str_radix(hex, 16).unwrap());
                    index += 3;
                }
                byte => {
                    out.push(byte);
                    index += 1;
                }
            }
        }
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn small_payload_uses_plain_query() {
        let (query, truncated) = encode_query(Prefill {
            title: "Hello".to_owned(),
            source: "chat".to_owned(),
            ..Prefill::default()
        })
        .unwrap();
        assert!(!truncated);
        assert_eq!(query, "source=chat&title=Hello");
    }

    #[test]
    fn query_escape_matches_go() {
        assert_eq!(query_escape("hello world\n/x"), "hello+world%0A%2Fx");
        assert_eq!(query_escape("a-_.~"), "a-_.~");
    }

    #[test]
    fn repetitive_body_uses_compressed_deeplink() {
        let body = "the quick brown fox jumps over the lazy dog\n".repeat(400);
        let (query, truncated) = encode_query(Prefill {
            title: "Long".to_owned(),
            body: body.clone(),
            source: "chat".to_owned(),
        })
        .unwrap();
        assert!(!truncated);
        assert!(query.starts_with("d="));
        assert!(query.len() <= DEEPLINK_MAX);
        let payload = decode_query(&query);
        assert_eq!(payload.b, body);
        assert_eq!(payload.t, "Long");
        assert_eq!(payload.s, "chat");
    }

    #[test]
    fn oversized_incompressible_body_is_trimmed() {
        let body = random_ascii(65_536);
        let (query, truncated) = encode_query(Prefill {
            title: "Huge".to_owned(),
            body: body.clone(),
            source: "chat".to_owned(),
        })
        .unwrap();
        assert!(truncated);
        assert!(query.len() <= DEEPLINK_MAX);
        let payload = decode_query(&query);
        assert!(!payload.b.is_empty());
        assert!(payload.b.len() < body.len());
        assert_eq!(payload.t, "Huge");
    }

    #[test]
    fn build_url_appends_intake() {
        let cases = [
            (
                "http://localhost:3000",
                "http://localhost:3000/intake?source=chat",
            ),
            (
                "http://localhost:3000/",
                "http://localhost:3000/intake?source=chat",
            ),
            (
                "https://funnel.example.com/funnel/",
                "https://funnel.example.com/funnel/intake?source=chat",
            ),
        ];
        for (base, want) in cases {
            let (got, _) = build_url(
                base,
                Prefill {
                    source: "chat".to_owned(),
                    ..Prefill::default()
                },
            )
            .unwrap();
            assert_eq!(got, want);
        }
    }

    #[test]
    fn build_url_rejects_bad_base() {
        for base in [
            "",
            "ftp://example.com",
            "http://",
            "https://example.com?a=1",
            "https://example.com#frag",
        ] {
            assert!(
                build_url(
                    base,
                    Prefill {
                        source: "chat".to_owned(),
                        ..Prefill::default()
                    }
                )
                .is_err(),
                "{base:?} should fail"
            );
        }
    }

    #[test]
    fn empty_prefill_has_no_query() {
        let (url, _) = build_url("http://localhost:3000", Prefill::default()).unwrap();
        assert_eq!(url, "http://localhost:3000/intake");
    }

    fn random_ascii(size: usize) -> String {
        const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let mut state: u64 = 0x9e37_79b9_7f4a_7c15;
        let mut out = String::with_capacity(size);
        for _ in 0..size {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            out.push(ALPHABET[(state >> 33) as usize % ALPHABET.len()] as char);
        }
        out
    }
}
