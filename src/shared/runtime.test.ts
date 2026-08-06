import { describe, it, expect, vi } from "vitest";
import {
	runtimeAvailable,
	sendRuntimeMessage,
	sendRuntimeMessageAsync,
	type RuntimeLike,
} from "./runtime";

/** A fake chrome.runtime whose callback form delivers asynchronously, like
 * Chrome's own messaging (so tests exercise real call ordering). */
function fakeRuntime(
	overrides: Partial<RuntimeLike> & { sendMessageImpl?: RuntimeLike["sendMessage"] } = {},
): RuntimeLike & { sent: unknown[] } {
	const sent: unknown[] = [];
	const runtime: RuntimeLike = {
		id: "fake-extension-id",
		sendMessage: (message: unknown, callback?: (response: any) => void) => {
			sent.push(message);
			if (callback) {
				runtime.lastError = undefined;
				setTimeout(() => callback({ ok: true }), 0);
				return undefined;
			}
			return Promise.resolve({ ok: true });
		},
		...overrides,
	};
	return { ...runtime, sent };
}

describe("runtimeAvailable", () => {
	it("is false when there is no runtime at all", () => {
		expect(runtimeAvailable(undefined)).toBe(false);
	});

	it("is false when the context is invalidated (runtime.id undefined)", () => {
		expect(runtimeAvailable({ id: undefined })).toBe(false);
	});

	it("is true for a live context", () => {
		expect(runtimeAvailable({ id: "ext-id" })).toBe(true);
	});

	it("is false when reading id throws (defensive against browser quirks)", () => {
		const throwing = {
			get id(): string | undefined {
				throw new Error("Extension context invalidated.");
			},
			sendMessage: () => Promise.resolve({}),
		} satisfies RuntimeLike;
		expect(runtimeAvailable(throwing)).toBe(false);
	});
});

describe("sendRuntimeMessage", () => {
	it("does nothing (and never calls the callback) on a dead context", () => {
		const callback = vi.fn();
		expect(() =>
			sendRuntimeMessage({ type: "X" }, callback, undefined),
		).not.toThrow();
		expect(callback).not.toHaveBeenCalled();
	});

	it("forwards the response to the callback on a live context", async () => {
		const runtime = fakeRuntime();
		const callback = vi.fn();
		sendRuntimeMessage({ type: "X" }, callback, runtime);
		await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
		expect(callback).toHaveBeenCalledWith({ ok: true });
		expect(runtime.sent).toEqual([{ type: "X" }]);
	});

	it("swallows the mid-flight 'Extension context invalidated' throw", () => {
		const runtime = fakeRuntime({
			sendMessage: () => {
				throw new Error("Extension context invalidated.");
			},
		});
		const callback = vi.fn();
		expect(() => sendRuntimeMessage({ type: "X" }, callback, runtime)).not.toThrow();
		expect(callback).not.toHaveBeenCalled();
	});

	it("swallows a rejected promise in the no-callback form", async () => {
		const runtime = fakeRuntime({
			sendMessage: () => Promise.reject(new Error("Extension context invalidated.")),
		});
		expect(() => sendRuntimeMessage({ type: "X" }, undefined, runtime)).not.toThrow();
		// Give the rejection handler a tick to run; an unhandled rejection would fail the suite.
		await new Promise((resolve) => setTimeout(resolve, 10));
	});

	it("consumes lastError before invoking the callback (callback-API contract)", async () => {
		// Chrome's `lastError` is cleared by reading it — model that with a getter.
		let lastError: { message?: string } | undefined = { message: "stale" };
		const runtime: RuntimeLike = {
			id: "ext-id",
			get lastError() {
				const current = lastError;
				lastError = undefined;
				return current;
			},
			sendMessage: (_message, callback) => {
				setTimeout(() => callback?.({ ok: true }), 0);
				return undefined;
			},
		};
		const callback = vi.fn();
		sendRuntimeMessage({ type: "X" }, callback, runtime);
		await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
		expect(lastError).toBeUndefined();
		expect(callback).toHaveBeenCalledWith({ ok: true });
	});
});

describe("sendRuntimeMessageAsync", () => {
	it("resolves undefined (not throw) on a dead context", async () => {
		await expect(sendRuntimeMessageAsync({ type: "X" }, undefined)).resolves.toBeUndefined();
	});

	it("resolves the response on a live context", async () => {
		const runtime = fakeRuntime();
		await expect(sendRuntimeMessageAsync<{ ok: boolean }>({ type: "X" }, runtime)).resolves.toEqual({ ok: true });
	});

	it("resolves undefined when sendMessage rejects mid-flight", async () => {
		const runtime = fakeRuntime({
			sendMessage: () => Promise.reject(new Error("Extension context invalidated.")),
		});
		await expect(sendRuntimeMessageAsync({ type: "X" }, runtime)).resolves.toBeUndefined();
	});
});
