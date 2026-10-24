import { describe, expect, test } from "bun:test";
import { readBlocked, writeBlocked } from "#lib/funnel-metadata";
import type { DelayItem } from "#lib/server/actuals/store";
import type { IssueTime } from "#lib/server/actuals/time";
import type { EpicRef } from "#lib/server/issues/types";
import {
	blockInfoPayload,
	canCloseDelay,
	canDeleteDelay,
	canManage,
	canSubmitBlock,
	delayDuration,
	delayReasonLabel,
	epicHref,
	epicPropertyState,
	formatDuration,
	splitDelays,
	timeCardRows
} from "./inspector-format";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const MINUTE = 60_000;

function time(overrides: Partial<IssueTime> = {}): IssueTime {
	return {
		actualMinutes: 120,
		delayMinutes: 30,
		estimateMinutes: 240,
		varianceMinutes: -120,
		leadMinutes: 600,
		cycleMinutes: 300,
		delayCount: 1,
		...overrides
	};
}

function delay(overrides: Partial<DelayItem> = {}): DelayItem {
	return {
		id: "d1",
		org: "orgA",
		name: "core",
		issueNumber: 1,
		reason: "dependency",
		startedAt: NOW - 2 * 60 * MINUTE,
		endedAt: NOW - 60 * MINUTE,
		note: "",
		source: "manual",
		...overrides
	};
}

describe("inspector formatting", () => {
	test("test_time_card_formats", () => {
		expect(formatDuration(240)).toBe("4h");
		expect(formatDuration(90)).toBe("1h 30m");
		expect(formatDuration(0)).toBe("0m");
		expect(formatDuration(null)).toBe("—");

		const rows = timeCardRows(time());
		expect(rows.map((row) => [row.label, row.value])).toEqual([
			["Estimate", "4h"],
			["Actual", "2h"],
			["Delay", "30m"],
			["Variance", "-2h"]
		]);
		expect(rows.at(-1)?.tone).toBe("negative");
	});
});

describe("delay list", () => {
	test("test_delay_list_splits_auto_and_manual", () => {
		const auto = delay({
			id: "auto",
			source: "blocked",
			reason: "review",
			endedAt: null
		});
		const manual = delay({ id: "manual", source: "manual", endedAt: null });
		const grouped = splitDelays([auto, manual]);

		expect(grouped.automatic.map((row) => row.id)).toEqual(["auto"]);
		expect(grouped.manual.map((row) => row.id)).toEqual(["manual"]);
		expect(canCloseDelay(auto, true)).toBe(false);
		expect(canCloseDelay(manual, true)).toBe(true);
		expect(canCloseDelay(delay({ endedAt: NOW }), true)).toBe(false);
		expect(canDeleteDelay(auto, true)).toBe(false);
		expect(canDeleteDelay(manual, true)).toBe(true);
		expect(delayReasonLabel("review")).toBe("Review");
		expect(delayDuration(auto, NOW)).toBe("2h");
	});
});

describe("block reason", () => {
	test("test_block_reason_required", () => {
		expect(canSubmitBlock({ blocker: "API", needs: "deploy" })).toBe(false);
		expect(canSubmitBlock({ blocker: "API", needs: "deploy", reason: "" })).toBe(false);
		expect(
			canSubmitBlock({ blocker: "API", needs: "deploy", reason: "not-a-reason" })
		).toBe(false);
		expect(
			canSubmitBlock({ blocker: "API", needs: "deploy", reason: "dependency" })
		).toBe(true);

		const info = blockInfoPayload({
			blocker: " API ",
			needs: " deploy ",
			trying: "",
			recheck: "",
			reason: "dependency"
		});
		expect(info).toEqual({
			blocker: "API",
			needs: "deploy",
			trying: "",
			recheck: "",
			reason: "dependency"
		});
		expect(blockInfoPayload({ blocker: "API", needs: "deploy", reason: "" })).toBeNull();
		if (info === null) throw new Error("expected block info");
		// The payload's reason survives the metadata write the dialog triggers.
		expect(readBlocked(writeBlocked("desc", info)).info?.reason).toBe("dependency");
	});
});

describe("epic property", () => {
	test("test_epic_property_states", () => {
		const parent: EpicRef = { repo: "orgA/core", number: 5, title: "Epic" };
		expect(epicPropertyState({ isEpic: true, parent: null })).toBe("epic");
		expect(epicPropertyState({ isEpic: false, parent })).toBe("child");
		expect(epicPropertyState({ isEpic: false, parent: null })).toBe("none");
		expect(epicHref("orgA/core", 5)).toBe("/epics/orgA/core/5");
	});
});

describe("read-only", () => {
	test("test_read_only_hides_controls", () => {
		expect(canManage(false)).toBe(false);
		expect(canManage(false, false)).toBe(false);
		expect(canManage(true)).toBe(true);
		expect(canManage(true, true)).toBe(false);
		expect(canCloseDelay(delay(), false)).toBe(false);
		expect(canDeleteDelay(delay(), false)).toBe(false);
	});
});
