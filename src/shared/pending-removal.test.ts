import { describe, it, expect } from "vitest";
import {
	requestRemoval,
	cancelRemoval,
	commitRemoval,
	visibleQueue,
	pendingCount,
	type PendingRemovalState,
} from "./pending-removal";
import type { ParkedVideo } from "./types";

function video(id: string): ParkedVideo {
	return { id, title: `Video ${id}`, channel: "Channel", addedAt: 1700000000000 };
}

describe("pending-removal — pure reducer", () => {
	describe("requestRemoval (D2 — one slot; new request commits the old)", () => {
		it("creates a pending slot from an empty state", () => {
			const res = requestRemoval(null, [video("A")]);
			expect(res.commitNow).toEqual([]);
			expect(res.state.videos.map((v) => v.id)).toEqual(["A"]);
			expect(res.state.requestedAt).toBeTypeOf("number");
		});

		it("stores N videos in one slot (bulk = one pending, D6)", () => {
			const res = requestRemoval(null, [video("A"), video("B"), video("C")]);
			expect(res.state.videos).toHaveLength(3);
			expect(res.commitNow).toEqual([]);
		});

		// Bug #2 regression: rapid A-then-B must commit A, not cancel A.
		it("requesting B while A is pending returns A in commitNow (A is committed, not cancelled)", () => {
			const first = requestRemoval(null, [video("A")]);
			const second = requestRemoval(first.state, [video("B")]);
			expect(second.commitNow).toEqual(["A"]);
			expect(second.state.videos.map((v) => v.id)).toEqual(["B"]);
		});
	});

	describe("cancelRemoval (D1 — undo never writes, never fails)", () => {
		it("discards the pending slot", () => {
			const state: PendingRemovalState = requestRemoval(null, [video("A")]).state;
			expect(cancelRemoval()).toBeNull();
			expect(state.videos.map((v) => v.id)).toEqual(["A"]);
		});
	});

	describe("commitRemoval (timer elapsed)", () => {
		it("returns the pending ids", () => {
			const state = requestRemoval(null, [video("A"), video("B")]).state;
			expect(commitRemoval(state)).toEqual(["A", "B"]);
		});

		// Bug #1 regression: undo must actually cancel the commit in every path.
		it("after undo (state null), commit removes nothing", () => {
			requestRemoval(null, [video("A"), video("B")]); // a slot existed, then user undoes
			cancelRemoval();
			expect(commitRemoval(null)).toEqual([]);
		});

		it("after supersede, the old slot's commit is handled by commitNow, not the timer", () => {
			const first = requestRemoval(null, [video("A")]);
			const second = requestRemoval(first.state, [video("B")]);
			// A was committed via commitNow; the timer only commits B now.
			expect(commitRemoval(second.state)).toEqual(["B"]);
		});
	});

	describe("visibleQueue (D4 — pending is a global display fact)", () => {
		it("returns raw unchanged when there is no pending slot", () => {
			const raw = [video("A"), video("B")];
			expect(visibleQueue(raw, null)).toEqual(raw);
		});

		it("filters the pending-deleted items out of the raw queue", () => {
			const raw = [video("A"), video("B"), video("C")];
			const pending = requestRemoval(null, [video("B")]).state;
			expect(visibleQueue(raw, pending).map((v) => v.id)).toEqual(["A", "C"]);
		});

		it("filters all N items of a bulk pending slot", () => {
			const raw = [video("A"), video("B"), video("C"), video("D")];
			const pending = requestRemoval(null, [video("B"), video("D")]).state;
			expect(visibleQueue(raw, pending).map((v) => v.id)).toEqual(["A", "C"]);
		});

		// D4 jebakan: read-for-display filters; read-for-write must NOT. This test
		// pins the display behaviour so the storage.ts split can be validated
		// against it (togglePin on raw preserves pending; on display it would drop).
		it("a read-modify-write over the DISPLAY queue would drop the pending item (the jebakan)", () => {
			const raw = [video("A"), video("B")];
			const pending = requestRemoval(null, [video("A")]).state;
			const display = visibleQueue(raw, pending);
			// simulating a naive togglePin built on the display view:
			const written = display.filter((v) => v.id !== "B"); // e.g. remove B
			expect(written).not.toContain(video("A")); // A is gone — the jebakan
			// the raw-based path preserves A:
			const rawWritten = raw.filter((v) => v.id !== "B");
			expect(rawWritten.map((v) => v.id)).toEqual(["A"]);
		});

		it("park sees the slot freed by a pending deletion (D4 freed slot)", () => {
			// raw is full (200 incl. A); A pending → display is 199 → a new park fits.
			const raw: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => video(`v${i}`));
			raw[0] = video("A"); // ensure A is present
			const pending = requestRemoval(null, [video("A")]).state;
			const display = visibleQueue(raw, pending);
			expect(display).toHaveLength(199);
			expect(display.some((v) => v.id === "A")).toBe(false);
		});
	});

	describe("pendingCount (G6 — honest toast)", () => {
		it("is 0 with no slot", () => {
			expect(pendingCount(null)).toBe(0);
		});
		it("is 1 for a single delete", () => {
			expect(pendingCount(requestRemoval(null, [video("A")]).state)).toBe(1);
		});
		it("is N for a bulk delete", () => {
			expect(
				pendingCount(requestRemoval(null, [video("A"), video("B"), video("C")]).state),
			).toBe(3);
		});
	});

	describe("D5 — undo restores without a cap check (restore never fails)", () => {
		it("after cancel, the previously-pending items are visible again with no write and no rejection", () => {
			const raw: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => video(`v${i}`));
			raw[0] = video("A");
			const pending = requestRemoval(null, [video("A")]).state;
			// during grace: A hidden, display 199
			expect(visibleQueue(raw, pending)).toHaveLength(199);
			// undo:
			const afterUndo = cancelRemoval();
			// no cap gate applies — restore is just "stop filtering":
			expect(visibleQueue(raw, afterUndo)).toHaveLength(200);
			expect(visibleQueue(raw, afterUndo).some((v) => v.id === "A")).toBe(true);
		});

		it("restore may temporarily exceed the cap (201/200) and that is allowed", () => {
			// 200/200 → delete A (pending, display 199) → park B accepted (raw 201)
			// → undo A → display 201/200, allowed; the cap only gates NEW parks.
			let raw: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => video(`v${i}`));
			raw[0] = video("A");
			const pendingA = requestRemoval(null, [video("A")]).state;
			void pendingA;
			// park B into raw (cap checked against display 199, so it fits)
			raw = [...raw, video("B")];
			// undo A:
			const afterUndo = cancelRemoval();
			expect(visibleQueue(raw, afterUndo)).toHaveLength(201);
		});
	});
});