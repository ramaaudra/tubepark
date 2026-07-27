/** Serializes asynchronous read-modify-write transactions in arrival order. */
export class MutationQueue {
	private tail: Promise<void> = Promise.resolve();

	run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation);
		this.tail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}
