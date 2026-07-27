import { describe, expect, it } from "vitest";
import { MutationQueue } from "./mutation-queue";

describe("MutationQueue", () => {
	it("serializes async operations in arrival order", async () => {
		const queue = new MutationQueue();
		const events: string[] = [];
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

		const first = queue.run(async () => {
			events.push("first:start");
			await firstGate;
			events.push("first:end");
			return 1;
		});
		const second = queue.run(async () => {
			events.push("second:start");
			return 2;
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);
		releaseFirst();
		expect(await Promise.all([first, second])).toEqual([1, 2]);
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	it("continues after a rejected operation", async () => {
		const queue = new MutationQueue();
		await expect(queue.run(async () => { throw new Error("failed"); })).rejects.toThrow("failed");
		await expect(queue.run(async () => "next")).resolves.toBe("next");
	});
});
