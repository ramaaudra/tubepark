import {
	isPendingRemovalOwner,
	type PendingRemovalOwner,
} from "./pending-removal";

export interface PendingRemovalSender {
	tab?: { id?: number };
	url?: string;
}

export function pendingRemovalOwnerForSender(
	sender: PendingRemovalSender | undefined,
): PendingRemovalOwner | null {
	if (typeof sender?.tab?.id === "number") return "content";
	if (!sender?.url) return null;
	try {
		const path = new URL(sender.url).pathname;
		if (path.endsWith("/popup.html")) return "popup";
		if (path.endsWith("/sidepanel.html")) return "sidepanel";
	} catch {
		return null;
	}
	return null;
}

export function pendingRemovalOwnerFromMessage(
	declared: unknown,
	sender: PendingRemovalSender | undefined,
): PendingRemovalOwner | null {
	const trusted = pendingRemovalOwnerForSender(sender);
	return trusted && isPendingRemovalOwner(declared) && declared === trusted ? trusted : null;
}
