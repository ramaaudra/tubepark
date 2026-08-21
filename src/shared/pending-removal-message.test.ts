import { describe, expect, it } from "vitest";
import {
	pendingRemovalOwnerFromMessage,
	pendingRemovalOwnerForSender,
} from "./pending-removal-message";

describe("pending-removal message ownership", () => {
	it("derives content ownership from a tab sender", () => {
		expect(pendingRemovalOwnerForSender({ tab: { id: 12 } })).toBe("content");
	});

	it("derives popup and side-panel ownership from extension page URLs", () => {
		expect(pendingRemovalOwnerForSender({ url: "chrome-extension://id/popup.html" })).toBe("popup");
		expect(pendingRemovalOwnerForSender({ url: "chrome-extension://id/sidepanel.html" })).toBe("sidepanel");
	});

	it("fails closed for missing, unknown, or mismatched ownership", () => {
		expect(pendingRemovalOwnerForSender(undefined)).toBeNull();
		expect(pendingRemovalOwnerForSender({ url: "https://example.com" })).toBeNull();
		expect(pendingRemovalOwnerFromMessage("popup", { tab: { id: 12 } })).toBeNull();
		expect(pendingRemovalOwnerFromMessage("sidepanel", { url: "chrome-extension://id/popup.html" })).toBeNull();
	});

	it("accepts only a declaration matching the trusted sender context", () => {
		expect(pendingRemovalOwnerFromMessage("popup", { url: "chrome-extension://id/popup.html" })).toBe("popup");
		expect(pendingRemovalOwnerFromMessage("content", { tab: { id: 12 } })).toBe("content");
	});
});
