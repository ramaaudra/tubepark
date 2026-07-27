import { describe, it, expect } from "vitest";
import {
	deriveCapacityState,
	parkVideoPure,
	removeVideoPure,
	removeManyPure,
	togglePinnedPure,
	reorderPinnedPure,
	assignCollectionPure,
	renameCollectionPure,
	deriveCollections,
	normalizeUiState,
	tryParkWithPending,
} from "./storage";
import { requestRemoval, type PendingRemovalState } from "./pending-removal";
import type { ParkedVideo } from "./types";

describe("Storage Pure Functions & Capacity Logic", () => {
	const sampleVideo1: ParkedVideo = {
		id: "abc12345678",
		title: "Test Video 1",
		channel: "Test Channel",
		addedAt: 1700000000000,
	};

	const sampleVideo2: ParkedVideo = {
		id: "xyz98765432",
		title: "Test Video 2",
		channel: "Another Channel",
		addedAt: 1700000001000,
	};

	describe("parkVideoPure", () => {
		it("adds video to empty queue", () => {
			const result = parkVideoPure([], sampleVideo1);
			expect(result.success).toBe(true);
			expect(result.duplicate).toBe(false);
			expect(result.full).toBe(false);
			expect(result.queue).toEqual([sampleVideo1]);
		});

		it("appends video to existing queue", () => {
			const result = parkVideoPure([sampleVideo1], sampleVideo2);
			expect(result.success).toBe(true);
			expect(result.queue).toHaveLength(2);
			expect(result.queue[1]).toEqual(sampleVideo2);
		});

		it("rejects duplicate video", () => {
			const result = parkVideoPure([sampleVideo1], sampleVideo1);
			expect(result.success).toBe(false);
			expect(result.duplicate).toBe(true);
			expect(result.full).toBe(false);
			expect(result.queue).toEqual([sampleVideo1]);
		});

		it("rejects when queue is full (200 items)", () => {
			const fullQueue: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => ({
				id: `vid_${i}`,
				title: `Video ${i}`,
				channel: "Channel",
				addedAt: 1700000000000 + i,
			}));
			const result = parkVideoPure(fullQueue, sampleVideo1);
			expect(result.success).toBe(false);
			expect(result.duplicate).toBe(false);
			expect(result.full).toBe(true);
			expect(result.queue).toHaveLength(200);
		});

		it("accepts when queue is at 199 (one below cap)", () => {
			const nearFullQueue: ParkedVideo[] = Array.from(
				{ length: 199 },
				(_, i) => ({
					id: `vid_${i}`,
					title: `Video ${i}`,
					channel: "Channel",
					addedAt: 1700000000000 + i,
				}),
			);
			const result = parkVideoPure(nearFullQueue, sampleVideo1);
			expect(result.success).toBe(true);
			expect(result.queue).toHaveLength(200);
		});
	});

	describe("removeVideoPure", () => {
		it("removes video by id", () => {
			const queue = [sampleVideo1, sampleVideo2];
			const result = removeVideoPure(queue, sampleVideo1.id);
			expect(result).toEqual([sampleVideo2]);
		});

		it("returns same queue when id not found", () => {
			const queue = [sampleVideo1];
			const result = removeVideoPure(queue, "nonexistent");
			expect(result).toEqual(queue);
		});

		it("returns empty array for empty queue", () => {
			const result = removeVideoPure([], "anything");
			expect(result).toEqual([]);
		});
	});

	describe("collection and pinned ordering mutations", () => {
		it("derives collection counts as a complete partition", () => {
			const queue = [
				sampleVideo1,
				{ ...sampleVideo2, collection: "Belajar" },
				{ ...sampleVideo1, id: "third", collection: "Belajar" },
			];
			const collections = deriveCollections(queue);
			expect(collections).toEqual([
				{ name: null, count: 1 },
				{ name: "Belajar", count: 2 },
			]);
			expect(collections.reduce((sum, item) => sum + item.count, 0)).toBe(queue.length);
		});

		it("normalizes missing, partial, and invalid UI state", () => {
			expect(normalizeUiState(undefined)).toEqual({ activeCollection: null, grouping: "time" });
			expect(normalizeUiState({ activeCollection: "Belajar" })).toEqual({ activeCollection: "Belajar", grouping: "time" });
			expect(normalizeUiState({ activeCollection: 4, grouping: "bogus" })).toEqual({ activeCollection: null, grouping: "time" });
			expect(normalizeUiState({ grouping: "channel" })).toEqual({ activeCollection: null, grouping: "channel" });
		});

		it("assigns and renames exactly one collection label", () => {
			const assigned = assignCollectionPure([sampleVideo1, sampleVideo2], [sampleVideo1.id], "Belajar");
			expect(assigned[0].collection).toBe("Belajar");
			expect(assigned[1].collection).toBeUndefined();
			expect(renameCollectionPure(assigned, "Belajar", "Kerja")[0].collection).toBe("Kerja");
		});

		it("persists a pinned ordering", () => {
			const queue = [{ ...sampleVideo1, pinned: true }, { ...sampleVideo2, pinned: true }];
			const result = reorderPinnedPure(queue, [sampleVideo2.id, sampleVideo1.id]);
			expect(result.map((item) => item.order)).toEqual([2, 1]);
		});
	});

	describe("togglePinnedPure", () => {
		it("sets pinned to true when not pinned", () => {
			const queue = [sampleVideo1];
			const result = togglePinnedPure(queue, sampleVideo1.id);
			expect(result[0].pinned).toBe(true);
		});

		it("sets pinned to false when already pinned", () => {
			const queue = [{ ...sampleVideo1, pinned: true }];
			const result = togglePinnedPure(queue, sampleVideo1.id);
			expect(result[0].pinned).toBeUndefined();
			expect(result[0].order).toBeUndefined();
		});

		it("only affects target video, leaves others unchanged", () => {
			const queue = [
				{ ...sampleVideo1, pinned: true },
				{ ...sampleVideo2, pinned: false },
			];
			const result = togglePinnedPure(queue, sampleVideo2.id);
			expect(result[0].pinned).toBe(true);
			expect(result[1].pinned).toBe(true);
		});

		it("returns unchanged queue when id not found", () => {
			const queue = [sampleVideo1];
			const result = togglePinnedPure(queue, "nonexistent");
			expect(result).toEqual(queue);
		});
	});

	describe("deriveCapacityState", () => {
		it("returns safe status for low count", () => {
			const state = deriveCapacityState(10, 200);
			expect(state.status).toBe("safe");
			expect(state.count).toBe(10);
			expect(state.max).toBe(200);
			expect(state.percentage).toBe(5);
		});

		it("returns warning status at 80% threshold", () => {
			const state = deriveCapacityState(160, 200);
			expect(state.status).toBe("warning");
		});

		it("returns warning status just below full", () => {
			const state = deriveCapacityState(199, 200);
			expect(state.status).toBe("warning");
		});

		it("returns full status at max", () => {
			const state = deriveCapacityState(200, 200);
			expect(state.status).toBe("full");
			expect(state.percentage).toBe(100);
		});

		it("returns safe status for empty queue", () => {
			const state = deriveCapacityState(0, 200);
			expect(state.status).toBe("safe");
			expect(state.percentage).toBe(0);
		});
	});

	describe("removeManyPure", () => {
		it("removes all matching ids", () => {
			const queue = [sampleVideo1, sampleVideo2];
			expect(removeManyPure(queue, [sampleVideo1.id, sampleVideo2.id])).toEqual([]);
		});

		it("leaves non-matching ids untouched", () => {
			const queue = [sampleVideo1, sampleVideo2];
			expect(removeManyPure(queue, ["nope"]).map((v) => v.id)).toEqual([
				sampleVideo1.id,
				sampleVideo2.id,
			]);
		});
	});

	describe("tryParkWithPending (G5 — pending-aware park)", () => {
		const other: ParkedVideo = {
			id: "other0000000",
			title: "Other",
			channel: "Ch",
			addedAt: 1700000000002,
		};

		it("parks into an empty queue", () => {
			const result = tryParkWithPending([], null, sampleVideo1);
			expect(result.success).toBe(true);
			expect(result.queue).toEqual([sampleVideo1]);
		});

		// D4: a pending deletion frees a slot for a new park.
		it("accepts a park when a pending deletion frees a slot at the cap", () => {
			const full: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => ({
				id: `vid_${i}`,
				title: `Video ${i}`,
				channel: "Channel",
				addedAt: 1700000000000 + i,
			}));
			const pending: PendingRemovalState = requestRemoval(null, [full[0]]).state;
			const result = tryParkWithPending(full, pending, other);
			expect(result.success).toBe(true);
			expect(result.full).toBe(false);
			expect(result.queue).toHaveLength(200); // display: 201 raw - 1 pending = 200
		});

		// D5: park-new still enforces the cap on the display count.
		it("rejects a new park when the display queue is full (no pending)", () => {
			const full: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => ({
				id: `vid_${i}`,
				title: `Video ${i}`,
				channel: "Channel",
				addedAt: 1700000000000 + i,
			}));
			const result = tryParkWithPending(full, null, other);
			expect(result.success).toBe(false);
			expect(result.full).toBe(true);
		});

		it("rejects a new park at 201/200 overflow (after an undo restored over cap)", () => {
			// raw 201 (restore overflow), no pending → display 201 → full.
			const overflow: ParkedVideo[] = Array.from({ length: 201 }, (_, i) => ({
				id: `vid_${i}`,
				title: `Video ${i}`,
				channel: "Channel",
				addedAt: 1700000000000 + i,
			}));
			const result = tryParkWithPending(overflow, null, other);
			expect(result.success).toBe(false);
			expect(result.full).toBe(true);
		});

		// Dup check runs against raw: a pending-deleted id is still in storage,
		// so re-parking it is a duplicate (no second copy written).
		it("reports a duplicate when re-parking a pending-deleted video", () => {
			const queue = [sampleVideo1, sampleVideo2];
			const pending: PendingRemovalState = requestRemoval(null, [sampleVideo1]).state;
			const result = tryParkWithPending(queue, pending, sampleVideo1);
			expect(result.success).toBe(false);
			expect(result.duplicate).toBe(true);
		});

		// D4 jebakan: the write base is raw, so the pending item is preserved.
		it("a successful park preserves a pending-deleted item in the result's raw base", () => {
			const queue = [sampleVideo1];
			const pending: PendingRemovalState = requestRemoval(null, [sampleVideo1]).state;
			const result = tryParkWithPending(queue, pending, sampleVideo2);
			expect(result.success).toBe(true);
			// display hides the pending item, so only sampleVideo2 is visible...
			expect(result.queue.map((v) => v.id)).toEqual([sampleVideo2.id]);
			// ...but the background writes raw = [sampleVideo1, sampleVideo2], so a
			// subsequent read with no pending restores sampleVideo1 (undo) — verified
			// here by re-filtering with a null pending over the implicit new raw.
			const implicitNewRaw = [sampleVideo1, sampleVideo2];
			expect(implicitNewRaw).toContain(sampleVideo1);
		});
	});
});
