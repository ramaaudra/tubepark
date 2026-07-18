import { describe, it, expect } from "vitest";
import {
	deriveCapacityState,
	parkVideoPure,
	removeVideoPure,
	togglePinnedPure,
} from "./storage";
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

	describe("togglePinnedPure", () => {
		it("sets pinned to true when not pinned", () => {
			const queue = [sampleVideo1];
			const result = togglePinnedPure(queue, sampleVideo1.id);
			expect(result[0].pinned).toBe(true);
		});

		it("sets pinned to false when already pinned", () => {
			const queue = [{ ...sampleVideo1, pinned: true }];
			const result = togglePinnedPure(queue, sampleVideo1.id);
			expect(result[0].pinned).toBe(false);
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
});
