import { extractYouTubeVideoId } from "./capture-predicates";

export interface SimpleTab {
	id?: number;
	url?: string;
	title?: string;
	active?: boolean;
	windowId?: number;
}

export interface NowPlayingTab {
	id: number;
	videoId: string;
	windowId: number;
}

export interface TabOperations {
	getActiveTab(): Promise<{ id: number; url: string; title: string } | null>;
	getWatchTabs(): Promise<SimpleTab[]>;
	closeTab(id: number): Promise<void>;
	openVideo(videoId: string): Promise<void>;
	openSidePanel(): Promise<void>;
	getNowPlayingTab(): Promise<NowPlayingTab | null>;
}

export class RealTabOperations implements TabOperations {
	constructor(private _chrome?: typeof chrome) {}

	private get c() {
		return this._chrome ?? (typeof chrome !== "undefined" ? chrome : undefined);
	}

	async getActiveTab() {
		if (!this.c?.tabs) return null;
		const tabs = await this.c.tabs.query({ active: true, currentWindow: true });
		if (tabs.length === 0) return null;
		const t = tabs[0];
		return {
			id: t.id!,
			url: t.url ?? "",
			title: t.title ?? "",
		};
	}

	async getWatchTabs() {
		if (!this.c?.tabs) return [];
		const tabs = await this.c.tabs.query({});
		return tabs.filter((t) => !!t.url && extractYouTubeVideoId(t.url) !== null);
	}

	async closeTab(id: number) {
		if (!this.c?.tabs) return;
		await this.c.tabs.remove(id);
	}

	async openVideo(videoId: string) {
		if (!this.c?.tabs) return;
		const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
		const allTabs = await this.c.tabs.query({});

		const existingWatchTab = allTabs.find((tab) => {
			if (!tab.url) return false;
			return extractYouTubeVideoId(tab.url) !== null;
		});

		if (existingWatchTab?.id) {
			await this.c.tabs.update(existingWatchTab.id, {
				url: targetUrl,
				active: true,
			});
			if (existingWatchTab.windowId) {
				await this.c.windows.update(existingWatchTab.windowId, {
					focused: true,
				});
			}
		} else {
			await this.c.tabs.create({ url: targetUrl });
		}
	}

	async getNowPlayingTab() {
		if (!this.c?.tabs) return null;
		const tabs = await this.c.tabs.query({ active: true });
		const ytTab = tabs.find(
			(t) => t.active && t.url && extractYouTubeVideoId(t.url) !== null,
		);
		if (!ytTab?.id || !ytTab.windowId) return null;
		return {
			id: ytTab.id,
			videoId: extractYouTubeVideoId(ytTab.url!)!,
			windowId: ytTab.windowId,
		};
	}

	async openSidePanel() {
		if (!this.c?.sidePanel)
			throw new Error("chrome.sidePanel is not available");
		const w = await this.c.windows.getCurrent();
		if (w.id) await this.c.sidePanel.open({ windowId: w.id });
	}
}

export const tabOps: TabOperations = new RealTabOperations();

export class TestTabOperations implements TabOperations {
	calls: { method: string; args: unknown[] }[] = [];

	activeTab: { id: number; url: string; title: string } | null = null;
	watchTabs: SimpleTab[] = [];
	nowPlayingTab: NowPlayingTab | null = null;

	async getActiveTab() {
		this.calls.push({ method: "getActiveTab", args: [] });
		return this.activeTab;
	}

	async getWatchTabs() {
		this.calls.push({ method: "getWatchTabs", args: [] });
		return this.watchTabs;
	}

	async closeTab(id: number) {
		this.calls.push({ method: "closeTab", args: [id] });
	}

	async openVideo(videoId: string) {
		this.calls.push({ method: "openVideo", args: [videoId] });
	}

	async openSidePanel() {
		this.calls.push({ method: "openSidePanel", args: [] });
	}

	async getNowPlayingTab() {
		this.calls.push({ method: "getNowPlayingTab", args: [] });
		return this.nowPlayingTab;
	}
}
