import { describe, expect, test } from "bun:test";
import {
	activeFilterCount,
	buildFilterUrl,
	EMPTY_CLIENT_FILTER,
	isEmptyFilter,
	NONE,
	parseFilterParams,
	toFilterParams,
	toggleValue,
	type ClientFilter,
} from "./url-filter";

describe("parseFilterParams", () => {
	test("reads repeated and comma-joined values, trimming and de-duplicating", () => {
		const params = new URLSearchParams([
			["repo", "orgA/core"],
			["repo", "orgA/web, orgA/core"],
			["status", "todo"],
			["assignee", "me"],
		]);
		const filter = parseFilterParams(params);
		expect(filter.repos).toEqual(["orgA/core", "orgA/web"]);
		expect(filter.statuses).toEqual(["todo"]);
		expect(filter.assignees).toEqual(["me"]);
		expect(filter.search).toBe("");
	});

	test("keeps the `none` sentinel", () => {
		const filter = parseFilterParams(new URLSearchParams("status=none"));
		expect(filter.statuses).toEqual([NONE]);
	});

	test("trims the search term", () => {
		expect(parseFilterParams(new URLSearchParams("q=%20foo%20")).search).toBe(
			"foo",
		);
	});

	test("yields an empty filter for empty params", () => {
		expect(parseFilterParams(new URLSearchParams())).toEqual(
			EMPTY_CLIENT_FILTER,
		);
	});
});

describe("toFilterParams", () => {
	test("omits empty dimensions and repeated-encodes values", () => {
		const params = toFilterParams({
			...EMPTY_CLIENT_FILTER,
			repos: ["orgA/core", "orgA/web"],
			statuses: ["todo"],
			search: "",
		});
		expect(params.getAll("repo")).toEqual(["orgA/core", "orgA/web"]);
		expect(params.getAll("status")).toEqual(["todo"]);
		expect(params.has("q")).toBe(false);
	});

	test("round-trips through parse", () => {
		const filter: ClientFilter = {
			repos: ["orgA/core"],
			states: ["open"],
			statuses: ["todo", "blocked"],
			assignees: ["me", "octocat"],
			unassigned: false,
			priorities: ["p1"],
			sizes: ["sm", "md"],
			types: ["Bug", "Feature"],
			labels: ["bug", "frontend"],
			planned: ["this-week"],
			milestones: ["orgA/core#3", NONE],
			blocked: true,
			waiting: false,
			sort: "updated",
			direction: "desc",
			search: "crash on boot",
		};
		expect(parseFilterParams(toFilterParams(filter))).toEqual(filter);
	});

	test("parses issue types case-insensitively with the untyped sentinel", () => {
		const filter = parseFilterParams(
			new URLSearchParams("type=Bug,feature&type=bug&type=NONE"),
		);
		expect(filter.types).toEqual(["Bug", "feature", "none"]);
	});

	test("maps assignee=none to unassigned and ORs it with named assignees", () => {
		const filter = parseFilterParams(
			new URLSearchParams("assignee=me&assignee=none"),
		);
		expect(filter.assignees).toEqual(["me"]);
		expect(filter.unassigned).toBe(true);
		expect(toFilterParams(filter).getAll("assignee")).toEqual(["me", "none"]);
	});

	test("parses blocked, sort and direction; unknown values fall back", () => {
		expect(parseFilterParams(new URLSearchParams("blocked=true")).blocked).toBe(true);
		expect(parseFilterParams(new URLSearchParams("blocked=false")).blocked).toBe(false);
		expect(parseFilterParams(new URLSearchParams("blocked=maybe")).blocked).toBeNull();
		expect(parseFilterParams(new URLSearchParams("waiting=true")).waiting).toBe(true);
		expect(parseFilterParams(new URLSearchParams("waiting=false")).waiting).toBe(false);
		expect(parseFilterParams(new URLSearchParams("waiting=maybe")).waiting).toBeNull();
		expect(parseFilterParams(new URLSearchParams("sort=title")).sort).toBe("title");
		expect(parseFilterParams(new URLSearchParams("sort=nope")).sort).toBe("priority");
		expect(parseFilterParams(new URLSearchParams("direction=DESC")).direction).toBe(
			"desc",
		);
		expect(parseFilterParams(new URLSearchParams("direction=sideways")).direction).toBe(
			"asc",
		);
	});

	test("omits the default sort and direction from generated URLs", () => {
		const params = toFilterParams(EMPTY_CLIENT_FILTER);
		expect(params.has("sort")).toBe(false);
		expect(params.has("direction")).toBe(false);
		const sorted = toFilterParams({
			...EMPTY_CLIENT_FILTER,
			sort: "title",
			direction: "desc",
		});
		expect(sorted.get("sort")).toBe("title");
		expect(sorted.get("direction")).toBe("desc");
	});
});

describe("buildFilterUrl", () => {
	test("replaces filter keys while preserving unrelated params", () => {
		const current = new URLSearchParams([
			["repo", "orgA/core"],
			["utm_source", "newsletter"],
		]);
		const url = buildFilterUrl("/issues", current, {
			...EMPTY_CLIENT_FILTER,
			statuses: ["todo"],
		});
		const parsed = new URL(url, "http://localhost");
		expect(parsed.pathname).toBe("/issues");
		expect(parsed.searchParams.getAll("repo")).toEqual([]);
		expect(parsed.searchParams.getAll("status")).toEqual(["todo"]);
		expect(parsed.searchParams.get("utm_source")).toBe("newsletter");
	});

	test("keeps the detail path while rewriting only the query", () => {
		expect(
			buildFilterUrl("/issues/orgA/core/1", new URLSearchParams(), {
				...EMPTY_CLIENT_FILTER,
				statuses: ["todo"],
			}),
		).toBe("/issues/orgA/core/1?status=todo");
	});

	test("returns a bare path when the filter is empty", () => {
		const current = new URLSearchParams([["utm_source", "newsletter"]]);
		expect(buildFilterUrl("/inbox", current, EMPTY_CLIENT_FILTER)).toBe(
			"/inbox?utm_source=newsletter",
		);
	});
});

describe("toggleValue", () => {
	test("adds and removes immutably", () => {
		const start = ["a"];
		expect(toggleValue(start, "b")).toEqual(["a", "b"]);
		expect(toggleValue(start, "a")).toEqual([]);
		expect(start).toEqual(["a"]);
	});
});

describe("activeFilterCount / isEmptyFilter", () => {
	test("counts dimensions, not values", () => {
		const filter: ClientFilter = {
			...EMPTY_CLIENT_FILTER,
			repos: ["a", "b", "c"],
			search: "x",
		};
		expect(activeFilterCount(filter)).toBe(2);
		expect(isEmptyFilter(filter)).toBe(false);
		expect(isEmptyFilter(EMPTY_CLIENT_FILTER)).toBe(true);
	});

	test("counts unassigned and blocked, but not sort", () => {
		expect(
			activeFilterCount({ ...EMPTY_CLIENT_FILTER, unassigned: true }),
		).toBe(1);
		expect(
			activeFilterCount({ ...EMPTY_CLIENT_FILTER, blocked: false }),
		).toBe(1);
		expect(
			activeFilterCount({ ...EMPTY_CLIENT_FILTER, waiting: true }),
		).toBe(1);
		expect(
			activeFilterCount({ ...EMPTY_CLIENT_FILTER, assignees: ["me"], unassigned: true }),
		).toBe(1);
		expect(
			activeFilterCount({
				...EMPTY_CLIENT_FILTER,
				sort: "title",
				direction: "desc",
			}),
		).toBe(0);
	});
});
