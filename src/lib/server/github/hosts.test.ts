import { describe, expect, test } from "bun:test";
import {
  GithubHostError,
  isGithubCloud,
  normalizeGithubHost,
} from "./hosts";

describe("normalizeGithubHost", () => {
  test("keeps GitHub Cloud on the Cloud API", () => {
    expect(normalizeGithubHost("github.com")).toEqual({
      url: "https://github.com",
      api_url: "https://api.github.com",
    });
    expect(normalizeGithubHost("https://github.com/")).toEqual({
      url: "https://github.com",
      api_url: "https://api.github.com",
    });
  });

  test("derives the GHES API base from a bare enterprise host", () => {
    expect(normalizeGithubHost("acme.ghe.com")).toEqual({
      url: "https://acme.ghe.com",
      api_url: "https://acme.ghe.com/api/v3",
    });
    expect(normalizeGithubHost(" https://acme.ghe.com/ ")).toEqual({
      url: "https://acme.ghe.com",
      api_url: "https://acme.ghe.com/api/v3",
    });
  });

  test("accepts a pasted API base", () => {
    expect(normalizeGithubHost("https://acme.ghe.com/api/v3")).toEqual({
      url: "https://acme.ghe.com",
      api_url: "https://acme.ghe.com/api/v3",
    });
  });

  test("preserves an explicit http scheme for local GHES", () => {
    expect(normalizeGithubHost("http://ghe.local:8443")).toEqual({
      url: "http://ghe.local:8443",
      api_url: "http://ghe.local:8443/api/v3",
    });
  });

  test("rejects empty, malformed, and path-carrying values", () => {
    expect(() => normalizeGithubHost("")).toThrow(GithubHostError);
    expect(() => normalizeGithubHost("not a host")).toThrow(GithubHostError);
    expect(() => normalizeGithubHost("ftp://acme.ghe.com")).toThrow(
      GithubHostError,
    );
    expect(() => normalizeGithubHost("https://acme.ghe.com/other")).toThrow(
      GithubHostError,
    );
  });
});

describe("isGithubCloud", () => {
  test("distinguishes Cloud from enterprise hosts", () => {
    expect(isGithubCloud({ url: "https://github.com" })).toBe(true);
    expect(isGithubCloud({ url: "https://www.github.com" })).toBe(true);
    expect(isGithubCloud({ url: "https://acme.ghe.com" })).toBe(false);
  });
});
