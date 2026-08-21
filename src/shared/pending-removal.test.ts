import { describe, it, expect } from "vitest";
import {
	requestRemoval,
	startPendingRemoval,
	commitPendingRemoval,
	cancelRemoval,
	commitRemoval,
	createOperationId,
	isPendingExpired,
	normalizePendingRemoval,
	pendingSummary,
	visibleQueue,
	pendingCount,
	toPendingRemovalTarget,
	type PendingRemovalState,
} from "./pending-removal";
import type { ParkedVideo } from "./types";

function video(id: string, addedAt = 1700000000000): ParkedVideo {
	return { id, title: `Video ${id}`, channel: "Channel", addedAt };
}

describe("pending-removal — pure reducer", () => {
	describe("requestRemoval (D2 — one slot; new request commits the old)", () => {
		it("creates a pending slot from an empty state", () => {
			const res = requestRemoval(null, [video("A")], 1700000000000, "op-a");
			expect(res.commitNow).toEqual([]);
			expect(res.state.videos.map((v) => v.id)).toEqual(["A"]);
			expect(res.state.operationId).toBe("op-a");
			expect(res.state.requestedAt).toBe(1700000000000);
			expect(res.state.expiresAt).toBe(1700000005000);
		});

		it("stores N videos in one slot (bulk = one pending, D6)", () => {
			const res = requestRemoval(null, [video("A"), video("B"), video("C")], 1700000000000, "op-bulk");
			expect(res.state.videos).toHaveLength(3);
			expect(res.state.operationId).toBe("op-bulk");
			expect(res.commitNow).toEqual([]);
		});

		// Bug #2 regression: rapid A-then-B must commit A, not cancel A.
		it("requesting B while A is pending returns A in commitNow (A is committed, not cancelled)", () => {
			const first = requestRemoval(null, [video("A")], 1700000000000, "op-a");
			const second = requestRemoval(first.state, [video("B")], 1700000001000, "op-b");
			expect(second.commitNow).toEqual([toPendingRemovalTarget(video("A"))]);
			expect(second.state.videos.map((v) => v.id)).toEqual(["B"]);
			expect(second.state.operationId).toBe("op-b");
		});
	});

	describe("cancelRemoval (D1 — undo never writes, never fails)", () => {
		it("discards the pending slot", () => {
			const state: PendingRemovalState = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			expect(cancelRemoval(state, "op-a", "sidepanel")).toBeNull();
			expect(state.videos.map((v) => v.id)).toEqual(["A"]);
		});

		it("does not let a stale surface cancel a newer operation", () => {
			const state = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			expect(cancelRemoval(state, "op-stale", "sidepanel")).toBe(state);
			expect(cancelRemoval(state, "op-a", "popup")).toBe(state);
		});
	});

	describe("commitRemoval (timer elapsed)", () => {
		it("returns exact pending targets", () => {
			const state = requestRemoval(null, [video("A"), video("B")], 1700000000000, "op-bulk").state;
			expect(commitRemoval(state)).toEqual([
				toPendingRemovalTarget(video("A")),
				toPendingRemovalTarget(video("B")),
			]);
		});

		// Bug #1 regression: undo must actually cancel the commit in every path.
		it("after undo (state null), commit removes nothing", () => {
			const state = requestRemoval(null, [video("A"), video("B")], 1700000000000, "op-bulk").state;
			const afterUndo = cancelRemoval(state, "op-bulk", "sidepanel");
			expect(commitRemoval(afterUndo)).toEqual([]);
		});

		it("after supersede, the old slot's commit is handled by commitNow, not the timer", () => {
			const first = requestRemoval(null, [video("A")], 1700000000000, "op-a");
			const second = requestRemoval(first.state, [video("B")], 1700000001000, "op-b");
			// A was committed via commitNow; the timer only commits B now.
			expect(commitRemoval(second.state)).toEqual([toPendingRemovalTarget(video("B"))]);
		});
	});

	describe("identity-aware lifecycle transitions", () => {
		it("commits the old target and starts the new request from one raw snapshot", () => {
			const raw = [video("A"), video("B")];
			const pending = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			const result = startPendingRemoval(
				raw,
				pending,
				[toPendingRemovalTarget(video("B"))],
				1700000001000,
				"op-b",
				"sidepanel",
			);

			expect(result.rawQueue.map((item) => item.id)).toEqual(["B"]);
			expect(result.pending?.videos.map((item) => item.id)).toEqual(["B"]);
		});

		it("rejects a stale target when the same id was re-parked with a new identity", () => {
			const oldA = video("A", 1700000000000);
			const newA = video("A", 1700000009000);
			const result = startPendingRemoval(
				[newA],
				null,
				[toPendingRemovalTarget(oldA)],
				1700000010000,
				"op-stale",
				"popup",
			);

			expect(result.rawQueue).toEqual([newA]);
			expect(result.pending).toBeNull();
		});

		it("commits only the exact identity, never a re-parked same-id item", () => {
			const oldA = video("A", 1700000000000);
			const newA = video("A", 1700000009000);
			const pending = requestRemoval(null, [oldA], 1700000000000, "op-a").state;

			expect(commitPendingRemoval([newA], pending)).toEqual([newA]);
		});

		it("does not expose a pending target with a different identity", () => {
			const oldA = video("A", 1700000000000);
			const newA = video("A", 1700000009000);
			const pending = requestRemoval(null, [oldA], 1700000000000, "op-a").state;

			expect(visibleQueue([newA], pending)).toEqual([newA]);
		});
	});

	describe("expiry recovery", () => {
		it("treats expiry as an absolute deadline for worker recovery", () => {
			const state = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			expect(isPendingExpired(state, 1700000004999)).toBe(false);
			expect(isPendingExpired(state, 1700000005000)).toBe(true);
		});
	});

	describe("persistence helpers", () => {
		it("creates an operation id with a time component", () => {
			expect(createOperationId(1700000000000)).toMatch(/^1700000000000-/);
		});

		it("summarizes the operation without exposing the stored videos", () => {
			const state = requestRemoval(null, [video("A"), video("B")], 1700000000000, "op-bulk", "sidepanel").state;
			expect(pendingSummary(state, "sidepanel")).toEqual({ operationId: "op-bulk", count: 2, owner: "sidepanel" });
			expect(pendingSummary(state, null)).toBeNull();
			expect(pendingSummary(null, "sidepanel")).toBeNull();
		});

		it("only exposes Undo to the surface that owns the operation", () => {
			const state = requestRemoval(null, [video("A")], 1700000000000, "op-popup", "popup").state;
			expect(pendingSummary(state, "popup")).toEqual({
				operationId: "op-popup",
				count: 1,
				owner: "popup",
			});
			expect(pendingSummary(state, "sidepanel")).toBeNull();
		});

		it("normalizes valid persisted state and rejects malformed state", () => {
			const state = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			expect(normalizePendingRemoval(state)).toEqual(state);
			expect(normalizePendingRemoval({ ...state, owner: "unknown" })).toBeNull();
			expect(normalizePendingRemoval({ ...state, owner: undefined })).toBeNull();
			expect(normalizePendingRemoval({ ...state, expiresAt: Number.NaN })).toBeNull();
			expect(normalizePendingRemoval({ ...state, videos: [{ ...video("A"), addedAt: Number.NaN }] })).toBeNull();
			expect(normalizePendingRemoval({ ...state, videos: [{ id: "broken" }] })).toBeNull();
		});
	});

	describe("visibleQueue (D4 — pending is a global display fact)", () => {
		it("returns raw unchanged when there is no pending slot", () => {
			const raw = [video("A"), video("B")];
			expect(visibleQueue(raw, null)).toEqual(raw);
		});

		it("filters the pending-deleted items out of the raw queue", () => {
			const raw = [video("A"), video("B"), video("C")];
			const pending = requestRemoval(null, [video("B")], 1700000000000, "op-b").state;
			expect(visibleQueue(raw, pending).map((v) => v.id)).toEqual(["A", "C"]);
		});

		it("filters all N items of a bulk pending slot", () => {
			const raw = [video("A"), video("B"), video("C"), video("D")];
			const pending = requestRemoval(null, [video("B"), video("D")], 1700000000000, "op-bulk").state;
			expect(visibleQueue(raw, pending).map((v) => v.id)).toEqual(["A", "C"]);
		});

		// D4 jebakan: read-for-display filters; read-for-write must NOT. This test
		// pins the display behaviour so the storage.ts split can be validated
		// against it (togglePin on raw preserves pending; on display it would drop).
		it("a read-modify-write over the DISPLAY queue would drop the pending item (the jebakan)", () => {
			const raw = [video("A"), video("B")];
			const pending = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
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
			const pending = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
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
			expect(pendingCount(requestRemoval(null, [video("A")], 1700000000000, "op-a").state)).toBe(1);
		});
		it("is N for a bulk delete", () => {
			expect(
				pendingCount(requestRemoval(null, [video("A"), video("B"), video("C")], 1700000000000, "op-bulk").state),
			).toBe(3);
		});
	});

	describe("D5 — undo restores without a cap check (restore never fails)", () => {
		it("after cancel, the previously-pending items are visible again with no write and no rejection", () => {
			const raw: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => video(`v${i}`));
			raw[0] = video("A");
			const pending = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			// during grace: A hidden, display 199
			expect(visibleQueue(raw, pending)).toHaveLength(199);
			// undo:
			const afterUndo = cancelRemoval(pending, "op-a", "sidepanel");
			// no cap gate applies — restore is just "stop filtering":
			expect(visibleQueue(raw, afterUndo)).toHaveLength(200);
			expect(visibleQueue(raw, afterUndo).some((v) => v.id === "A")).toBe(true);
		});

		it("restore may temporarily exceed the cap (201/200) and that is allowed", () => {
			// 200/200 → delete A (pending, display 199) → park B accepted (raw 201)
			// → undo A → display 201/200, allowed; the cap only gates NEW parks.
			let raw: ParkedVideo[] = Array.from({ length: 200 }, (_, i) => video(`v${i}`));
			raw[0] = video("A");
			const pendingA = requestRemoval(null, [video("A")], 1700000000000, "op-a").state;
			// park B into raw (cap checked against display 199, so it fits)
			raw = [...raw, video("B")];
			// undo A:
			const afterUndo = cancelRemoval(pendingA, "op-a", "sidepanel");
			expect(visibleQueue(raw, afterUndo)).toHaveLength(201);
		});
	});
});
