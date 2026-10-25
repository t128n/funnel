import { describe, expect, test } from "bun:test";
import { resolutionFor, severityWord, statusToken } from "./bug-vocabulary";

describe("bug vocabulary", () => {
	test("test_status_token", () => {
		expect(statusToken("backlog", "open")).toBe("BACKLOG");
		expect(statusToken("todo", "open")).toBe("TODO");
		expect(statusToken("in-progress", "open")).toBe("IN PROGRESS");
		expect(statusToken("in-review", "open")).toBe("IN REVIEW");
		expect(statusToken("done", "closed")).toBe("DONE");
		// A closed thread keeps the stage it was closed from.
		expect(statusToken("in-progress", "closed")).toBe("IN PROGRESS");
		expect(statusToken(null, "open")).toBe("UNCONFIRMED");
		expect(statusToken(null, "closed")).toBe("CLOSED");
	});

	test("test_resolution", () => {
		expect(resolutionFor("completed")).toBe("FIXED");
		expect(resolutionFor("not_planned")).toBe("WONTFIX");
		expect(resolutionFor("duplicate")).toBe("DUPLICATE");
		expect(resolutionFor("reopened")).toBe("REOPENED");
		expect(resolutionFor(null)).toBe("—");
		expect(resolutionFor("unknown")).toBe("—");
	});

	test("test_severity_word", () => {
		expect(severityWord(1)).toBe("blocker");
		expect(severityWord(2)).toBe("major");
		expect(severityWord(3)).toBe("minor");
		expect(severityWord(null)).toBe("—");
		expect(severityWord(4)).toBe("—");
	});
});
