/**
 * Content-script messaging that can never throw on a dead extension context.
 *
 * The failure mode: Chrome does not reload already-open tabs when the extension
 * is reloaded or updated (the `wxt` dev server does this on every rebuild), so
 * a YouTube tab keeps running the OLD content script. Its DOM listeners still
 * fire, but its chrome.runtime bridge is dead. The runtime object stays truthy
 * — `!chrome.runtime` is NOT a liveness check — while calling any chrome.*
 * method throws `Error: Extension context invalidated.` `chrome.runtime.id`
 * reads `undefined` once the context is gone, which is the canonical probe.
 *
 * All helpers accept an optional runtime so tests can inject fakes; the
 * content-script call sites rely on the default (the real `chrome.runtime`).
 */

/** Minimal chrome.runtime surface this module uses — keeps the fakes in
 * `runtime.test.ts` independent of @types/chrome. */
export interface RuntimeLike {
	id?: string;
	lastError?: { message?: string };
	sendMessage(message: unknown, callback?: (response: any) => void): Promise<any> | void;
}

function resolveRuntime(): RuntimeLike | undefined {
	if (typeof chrome === "undefined") return undefined;
	return chrome.runtime as unknown as RuntimeLike | undefined;
}

/** True while the extension context is alive. A reloaded/updated extension
 * leaves `chrome.runtime.id` as `undefined`; the try/catch guards browsers
 * that throw on the property read itself. Takes the id-only shape so tests
 * can pass a partial fake. */
export function runtimeAvailable(
	runtime: Pick<RuntimeLike, "id"> | undefined = resolveRuntime(),
): boolean {
	if (!runtime) return false;
	try {
		return !!runtime.id;
	} catch {
		return false;
	}
}

/** Fire-and-forget sendMessage that bails on a dead context and swallows the
 * mid-flight invalidation throw. The callback form reads `lastError` (Chrome
 * requires the callback API to consume it) and then forwards the response —
 * `undefined` when no receiver exists, which every caller already tolerates. */
export function sendRuntimeMessage(
	message: unknown,
	callback?: (response: any) => void,
	runtime: RuntimeLike | undefined = resolveRuntime(),
): void {
	if (!runtime || !runtimeAvailable(runtime)) return;
	try {
		if (callback) {
			runtime.sendMessage(message, (response) => {
				void runtime.lastError;
				callback(response);
			});
		} else {
			const result = runtime.sendMessage(message);
			if (result && typeof (result as Promise<any>).catch === "function") {
				(result as Promise<any>).catch(() => {
					/* no receiver — non-fatal */
				});
			}
		}
	} catch {
		/* extension context invalidated mid-flight — nothing left to do */
	}
}

/** Promise-returning variant for callers that need the response (e.g. the
 * parked-id sync). Resolves `undefined` on a dead context instead of
 * throwing/rejecting. */
export async function sendRuntimeMessageAsync<T = unknown>(
	message: unknown,
	runtime: RuntimeLike | undefined = resolveRuntime(),
): Promise<T | undefined> {
	if (!runtime || !runtimeAvailable(runtime)) return undefined;
	try {
		return (await runtime.sendMessage(message)) as T | undefined;
	} catch {
		return undefined;
	}
}
