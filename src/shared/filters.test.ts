import { describe, expect, it } from "vitest";
import { formatDuration, matchesSearch, parseDurationSec } from "./filters";
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

describe("formatDuration", () => {
	it("formats minutes and hours", () => {
		expect(formatDuration(42)).toBe("0:42");
		expect(formatDuration(919)).toBe("15:19");
		expect(formatDuration(3753)).toBe("1:02:33");
	});
});
