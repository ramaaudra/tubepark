import { describe, expect, it } from "vitest";
import { matchesDuration, matchesSearch, parseDurationSec } from "./filters";
import type { ParkedVideo } from "./types";

const video: ParkedVideo = {
	id: "1",
	title: "TypeScript Patterns",
	channel: "Total TypeScript",
	addedAt: 1,
};

describe("matchesSearch", () => {
	it("matches case-insensitive substrings in title and channel", () => {
		expect(matchesSearch(video, "SCRIPT patt")).toBe(true);
		expect(matchesSearch(video, "total type")).toBe(true);
		expect(matchesSearch(video, "rust")).toBe(false);
	});
	it("matches an empty query", () => expect(matchesSearch(video, "  ")).toBe(true));
});

describe("parseDurationSec", () => {
	it.each([
		["15:19", 919],
		["15.19", 919],
		["1:02:33", 3753],
		["0:42", 42],
	])("parses %s", (input, expected) => expect(parseDurationSec(input)).toBe(expected));
	it.each(["LIVE", "", "Subtitel", "1:70"])("rejects %s", (input) => {
		expect(parseDurationSec(input)).toBeUndefined();
	});
});

describe("matchesDuration", () => {
	it("implements short, medium, long and excludes unknown", () => {
		expect(matchesDuration({ ...video, durationSec: 299 }, "short")).toBe(true);
		expect(matchesDuration({ ...video, durationSec: 300 }, "medium")).toBe(true);
		expect(matchesDuration({ ...video, durationSec: 1200 }, "medium")).toBe(true);
		expect(matchesDuration({ ...video, durationSec: 1201 }, "long")).toBe(true);
		expect(matchesDuration(video, "short")).toBe(false);
		expect(matchesDuration(video, "all")).toBe(true);
	});
});
