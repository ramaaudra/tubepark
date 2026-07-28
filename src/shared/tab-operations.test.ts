import { describe, it, expect, vi } from "vitest";
import {
	buildWatchUrl,
	RealTabOperations,
	TestTabOperations,
} from "./tab-operations";

// F4: pure URL construction for resume playback. Independent of chrome.* so
// the t= rules (omit 0/undefined, integer seconds) stay pinned without a fake.
describe("buildWatchUrl", () => {
	it("builds bare watch URL when resumeAt is undefined", () => {
		expect(buildWatchUrl("abc123")).toBe(
			"https://www.youtube.com/watch?v=abc123",
		);
	});

	it("builds bare watch URL when resumeAt is 0", () => {
		expect(buildWatchUrl("abc123", 0)).toBe(
			"https://www.youtube.com/watch?v=abc123",
		);
	});

	it("appends integer t= when resumeAt > 0", () => {
		expect(buildWatchUrl("abc123", 919)).toBe(
			"https://www.youtube.com/watch?v=abc123&t=919",
		);
	});
});

describe("TestTabOperations", () => {
	it("returns configured active tab", async () => {
		const ops = new TestTabOperations();
		ops.activeTab = {
			id: 1,
			url: "https://youtube.com/watch?v=abc",
			title: "Test",
		};

		const result = await ops.getActiveTab();
		expect(result).toEqual({
			id: 1,
			url: "https://youtube.com/watch?v=abc",
			title: "Test",
		});
	});

	it("returns null for active tab by default", async () => {
		const ops = new TestTabOperations();
		expect(await ops.getActiveTab()).toBeNull();
	});

	it("returns configured watch tabs", async () => {
		const ops = new TestTabOperations();
		ops.watchTabs = [{ id: 2, url: "https://youtube.com/watch?v=xyz" }];

		const result = await ops.getWatchTabs();
		expect(result).toEqual([{ id: 2, url: "https://youtube.com/watch?v=xyz" }]);
	});

	it("returns empty watch tabs by default", async () => {
		const ops = new TestTabOperations();
		expect(await ops.getWatchTabs()).toEqual([]);
	});

	it("records closeTab call with id", async () => {
		const ops = new TestTabOperations();
		await ops.closeTab(42);
		expect(ops.calls).toContainEqual({ method: "closeTab", args: [42] });
	});

	it("records openVideo call with videoId", async () => {
		const ops = new TestTabOperations();
		await ops.openVideo("abc123");
		expect(ops.calls).toContainEqual({
			method: "openVideo",
			args: ["abc123", undefined],
		});
	});

	it("records openVideo call with resumeAt", async () => {
		const ops = new TestTabOperations();
		await ops.openVideo("abc123", 919);
		expect(ops.calls).toContainEqual({
			method: "openVideo",
			args: ["abc123", 919],
		});
	});

	it("records openSidePanel call", async () => {
		const ops = new TestTabOperations();
		await ops.openSidePanel();
		expect(ops.calls).toContainEqual({ method: "openSidePanel", args: [] });
	});

	it("records getNowPlayingTab call", async () => {
		const ops = new TestTabOperations();
		ops.nowPlayingTab = { id: 5, videoId: "abc", windowId: 1, title: "Test Video" };
		const result = await ops.getNowPlayingTab();
		expect(result).toEqual({ id: 5, videoId: "abc", windowId: 1, title: "Test Video" });
		expect(ops.calls).toContainEqual({ method: "getNowPlayingTab", args: [] });
	});

	it("records multiple calls in order", async () => {
		const ops = new TestTabOperations();
		await ops.closeTab(1);
		await ops.openVideo("vid1");
		await ops.closeTab(2);

		expect(ops.calls).toEqual([
			{ method: "closeTab", args: [1] },
			{ method: "openVideo", args: ["vid1", undefined] },
			{ method: "closeTab", args: [2] },
		]);
	});
});

function fakeChrome() {
	return {
		tabs: {
			query: vi.fn(),
			update: vi.fn(),
			create: vi.fn(),
			remove: vi.fn(),
		},
		sidePanel: {
			open: vi.fn(),
		},
		windows: {
			getCurrent: vi.fn(),
			update: vi.fn(),
		},
	};
}

describe("RealTabOperations", () => {
	describe("getActiveTab", () => {
		it("returns active tab info from chrome.tabs.query", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 5, url: "https://youtube.com/watch?v=abc", title: "Test Video" },
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getActiveTab();

			expect(result).toEqual({
				id: 5,
				url: "https://youtube.com/watch?v=abc",
				title: "Test Video",
			});
			expect(chrome.tabs.query).toHaveBeenCalledWith({
				active: true,
				currentWindow: true,
			});
		});

		it("returns null when no active tab", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([]);

			const ops = new RealTabOperations(chrome as any);
			expect(await ops.getActiveTab()).toBeNull();
		});
	});

	describe("getWatchTabs", () => {
		it("queries ALL windows (not currentWindow)", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 1, url: "https://youtube.com/watch?v=abc" },
				{ id: 2, url: "https://google.com" },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.getWatchTabs();

			expect(chrome.tabs.query).toHaveBeenCalledWith({});
		});

		it("filters tabs to YouTube watch URLs only", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 1, url: "https://youtube.com/watch?v=abc" },
				{ id: 2, url: "https://youtube.com/" },
				{ id: 3, url: "https://google.com" },
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getWatchTabs();

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(1);
		});
	});

	describe("closeTab", () => {
		it("calls chrome.tabs.remove with the id", async () => {
			const chrome = fakeChrome();
			const ops = new RealTabOperations(chrome as any);

			await ops.closeTab(42);

			expect(chrome.tabs.remove).toHaveBeenCalledWith(42);
		});
	});

	describe("openVideo", () => {
		it("queries ALL windows for existing YouTube tab", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://youtube.com/watch?v=existing", windowId: 1 },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo");

			expect(chrome.tabs.query).toHaveBeenCalledWith({});
		});

		it("updates existing YouTube tab and focuses its window", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://youtube.com/watch?v=existing", windowId: 3 },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo");

			expect(chrome.tabs.update).toHaveBeenCalledWith(10, {
				url: "https://www.youtube.com/watch?v=newvideo",
				active: true,
			});
			expect(chrome.windows.update).toHaveBeenCalledWith(3, { focused: true });
			expect(chrome.tabs.create).not.toHaveBeenCalled();
		});

		it("creates new tab when no YouTube tab exists in any window", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://google.com", windowId: 1 },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo");

			expect(chrome.tabs.create).toHaveBeenCalledWith({
				url: "https://www.youtube.com/watch?v=newvideo",
			});
			expect(chrome.tabs.update).not.toHaveBeenCalled();
		});

		it("reuses first YouTube tab found across multiple windows", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://youtube.com/watch?v=vid1", windowId: 1 },
				{ id: 20, url: "https://youtube.com/watch?v=vid2", windowId: 2 },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo");

			expect(chrome.tabs.update).toHaveBeenCalledWith(10, {
				url: "https://www.youtube.com/watch?v=newvideo",
				active: true,
			});
			expect(chrome.windows.update).toHaveBeenCalledWith(1, { focused: true });
		});

		// F4: resumeAt builds ?v=ID&t=N. Omit t when undefined/0 so play starts
		// cleanly; integer seconds only (YouTube accepts t=90, not 1m30s).
		it("appends &t= when resumeAt > 0 on existing tab update", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://youtube.com/watch?v=existing", windowId: 1 },
			]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo", 919);

			expect(chrome.tabs.update).toHaveBeenCalledWith(10, {
				url: "https://www.youtube.com/watch?v=newvideo&t=919",
				active: true,
			});
		});

		it("appends &t= when resumeAt > 0 on new tab create", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo", 90);

			expect(chrome.tabs.create).toHaveBeenCalledWith({
				url: "https://www.youtube.com/watch?v=newvideo&t=90",
			});
		});

		it("omits t= when resumeAt is 0", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo", 0);

			expect(chrome.tabs.create).toHaveBeenCalledWith({
				url: "https://www.youtube.com/watch?v=newvideo",
			});
		});

		it("omits t= when resumeAt is undefined", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([]);

			const ops = new RealTabOperations(chrome as any);
			await ops.openVideo("newvideo");

			expect(chrome.tabs.create).toHaveBeenCalledWith({
				url: "https://www.youtube.com/watch?v=newvideo",
			});
		});
	});

	describe("getNowPlayingTab", () => {
		it("returns null when no YouTube watch tab is active", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{ id: 1, url: "https://google.com", active: true, windowId: 1 },
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getNowPlayingTab();

			expect(result).toBeNull();
		});

		it("returns tab info when active tab is YouTube watch URL", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{
					id: 7,
					url: "https://youtube.com/watch?v=abc123",
					active: true,
					windowId: 2,
					title: "My Video - YouTube",
				},
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getNowPlayingTab();

			expect(result).toEqual({
				id: 7,
				videoId: "abc123",
				windowId: 2,
				title: "My Video",
			});
		});

		it("uses empty title when the tab has no title", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{
					id: 9,
					url: "https://youtube.com/watch?v=xyz",
					active: true,
					windowId: 3,
				},
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getNowPlayingTab();

			expect(result).toEqual({
				id: 9,
				videoId: "xyz",
				windowId: 3,
				title: "",
			});
		});

		it("returns null when YouTube tab exists but is not active", async () => {
			const chrome = fakeChrome();
			chrome.tabs.query.mockResolvedValue([
				{
					id: 7,
					url: "https://youtube.com/watch?v=abc123",
					active: false,
					windowId: 2,
				},
			]);

			const ops = new RealTabOperations(chrome as any);
			const result = await ops.getNowPlayingTab();

			expect(result).toBeNull();
		});
	});

	describe("openSidePanel", () => {
		it("throws when chrome.sidePanel is unavailable", async () => {
			const chrome = fakeChrome();
			delete (chrome as any).sidePanel;

			const ops = new RealTabOperations(chrome as any);
			await expect(ops.openSidePanel()).rejects.toThrow(
				"chrome.sidePanel is not available",
			);
		});

		it("opens side panel for current window", async () => {
			const chrome = fakeChrome();
			chrome.windows.getCurrent.mockResolvedValue({ id: 7 });

			const ops = new RealTabOperations(chrome as any);
			await ops.openSidePanel();

			expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
		});
	});
});
