import { describe, expect, it } from "vitest";
import { formatAgeBadge, groupAndSortVideos } from "./grouping";
import type { ParkedVideo } from "./types";

const now = 1_700_000_000_000;
const day = 86_400_000;
const make = (id: string, ageDays: number, extra: Partial<ParkedVideo> = {}): ParkedVideo => ({
	id,
	title: id,
	channel: "Channel",
	addedAt: now - ageDays * day,
	...extra,
});

function ids(queue: ParkedVideo[], kind: "time" | "channel" = "time") {
	return groupAndSortVideos(queue, { kind }, now).map((group) => [group.label, group.items.map((video) => video.id)]);
}

describe("groupAndSortVideos time strategy", () => {
	it("returns no groups for an empty queue", () => expect(ids([])).toEqual([]));
	it("puts pinned videos in Up next", () => expect(ids([make("p", 20, { pinned: true })])).toEqual([["Up next", ["p"]]]));
	it("puts videos through seven days in Recent", () => expect(ids([make("fresh", 0.5), make("boundary", 7)])).toEqual([["Recent", ["fresh", "boundary"]]]));
	it("puts videos older than seven days in Older", () => expect(ids([make("old", 7 + 1 / day)])).toEqual([["Older", ["old"]]]));
	it("omits empty groups", () => expect(ids([make("fresh", 1)])).toHaveLength(1));
	it("sorts unpinned groups newest first", () => expect(ids([make("old", 3), make("new", 1)])[0][1]).toEqual(["new", "old"]));
	it("sorts Up next by gap-tolerant order", () => expect(ids([
		make("last", 1, { pinned: true, order: 20 }),
		make("first", 9, { pinned: true, order: 2 }),
		make("unordered", 0, { pinned: true }),
	])[0][1]).toEqual(["first", "last", "unordered"]));
	it("keeps pinned videos out of age groups", () => expect(ids([make("p", 20, { pinned: true }), make("old", 20)])).toEqual([["Up next", ["p"]], ["Older", ["old"]]]));
});

describe("groupAndSortVideos channel strategy", () => {
	it("keeps Up next cross-channel", () => expect(ids([make("a", 1, { channel: "A", pinned: true }), make("b", 2, { channel: "B", pinned: true })], "channel")[0][0]).toBe("Up next"));
	it("sorts channel buckets by newest item", () => expect(ids([make("a", 2, { channel: "A" }), make("b", 1, { channel: "B" })], "channel").map(([label]) => label)).toEqual(["B", "A"]));
	it("sorts inside buckets newest first", () => expect(ids([make("old", 4, { channel: "A" }), make("new", 2, { channel: "A" })], "channel")[0][1]).toEqual(["new", "old"]));
	it("combines legacy fallback channels in Unknown channel", () => {
		const groups = groupAndSortVideos([make("a", 1, { channel: "YouTube" }), make("b", 2, { channel: "YouTube Channel" })], { kind: "channel" }, now);
		expect(groups[0].kind).toBe("unknown");
		expect(groups[0].items).toHaveLength(2);
	});
	it("omits unknown when no fallback items exist", () => expect(groupAndSortVideos([make("a", 1, { channel: "A" })], { kind: "channel" }, now).some((group) => group.kind === "unknown")).toBe(false));
});

describe("formatAgeBadge", () => {
	it.each([[0, "Today"], [1, "1d"], [14, "14d"], [35, "1mo"], [65, "2mo"]])(
		"formats %s days",
		(days, expected) => expect(formatAgeBadge(make("v", days), now)).toBe(expected),
	);
});
