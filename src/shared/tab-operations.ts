import {
	cleanYouTubeTitle,
	extractYouTubeVideoId,
	YOUTUBE_TAB_URL_PATTERNS,
} from "./capture-predicates";

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
	/** Video title from the browser tab title (`<title> - YouTube`), cleaned via
	 * cleanYouTubeTitle. "" when the tab is still loading / has no title. The
	 * popup falls back to the parked-queue title then a neutral label — never
	 * the raw videoId. */
	title: string;
}

/** Build a YouTube watch URL, optionally with a resume timestamp (F4).
 * Pure so the t= rules are unit-testable without chrome.* fakes. */
export function buildWatchUrl(videoId: string, resumeAt?: number): string {
	const base = `https://www.youtube.com/watch?v=${videoId}`;
	return resumeAt && resumeAt > 0 ? `${base}&t=${resumeAt}` : base;
}

export interface TabOperations {
	getActiveTab(): Promise<{ id: number; url: string; title: string } | null>;
	getYouTubeTabs(): Promise<SimpleTab[]>;
	getWatchTabs(): Promise<SimpleTab[]>;
	sendMessage<T = unknown>(id: number, message: unknown): Promise<T | undefined>;
	subscribeToTabChanges(onActivated: () => void, onUpdated: (url?: string) => void): () => void;
	closeTab(id: number): Promise<void>;
	openVideo(videoId: string, resumeAt?: number): Promise<void>;
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
		const tabs = await this.c.tabs.query({
			active: true,
			currentWindow: true,
			url: [...YOUTUBE_TAB_URL_PATTERNS],
		});
		if (tabs.length === 0) return null;
		const t = tabs[0];
		return {
			id: t.id!,
			url: t.url ?? "",
			title: t.title ?? "",
		};
	}

	async getYouTubeTabs() {
		if (!this.c?.tabs) return [];
		return this.c.tabs.query({ url: [...YOUTUBE_TAB_URL_PATTERNS] });
	}

	async getWatchTabs() {
		if (!this.c?.tabs) return [];
		const tabs = await this.getYouTubeTabs();
		return tabs.filter((t) => !!t.url && extractYouTubeVideoId(t.url) !== null);
	}

	async sendMessage<T = unknown>(id: number, message: unknown): Promise<T | undefined> {
		if (!this.c?.tabs?.sendMessage) return undefined;
		try {
			return await this.c.tabs.sendMessage(id, message) as T;
		} catch {
			return undefined;
		}
	}

	subscribeToTabChanges(onActivated: () => void, onUpdated: (url?: string) => void): () => void {
		if (!this.c?.tabs) return () => undefined;
		const activatedListener = () => onActivated();
		const updatedListener = (_id: number, info: chrome.tabs.TabChangeInfo) => onUpdated(info.url);
		this.c.tabs.onActivated?.addListener(activatedListener);
		this.c.tabs.onUpdated?.addListener(updatedListener);
		return () => {
			this.c?.tabs?.onActivated?.removeListener(activatedListener);
			this.c?.tabs?.onUpdated?.removeListener(updatedListener);
		};
	}

	async closeTab(id: number) {
		if (!this.c?.tabs) return;
		await this.c.tabs.remove(id);
	}

	async openVideo(videoId: string, resumeAt?: number) {
		if (!this.c?.tabs) return;
		const targetUrl = buildWatchUrl(videoId, resumeAt);
		const allTabs = await this.c.tabs.query({ url: [...YOUTUBE_TAB_URL_PATTERNS] });

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
		const tabs = await this.c.tabs.query({
			active: true,
			url: [...YOUTUBE_TAB_URL_PATTERNS],
		});
		const ytTab = tabs.find(
			(t) => t.active && t.url && extractYouTubeVideoId(t.url) !== null,
		);
		if (!ytTab?.id || !ytTab.windowId) return null;
		return {
			id: ytTab.id,
			videoId: extractYouTubeVideoId(ytTab.url!)!,
			windowId: ytTab.windowId,
			title: cleanYouTubeTitle(ytTab.title),
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
	youtubeTabs: SimpleTab[] = [];
	watchTabs: SimpleTab[] = [];
	nowPlayingTab: NowPlayingTab | null = null;
	messageResponse: unknown;
	tabChangeCleanup = () => undefined;

	async getActiveTab() {
		this.calls.push({ method: "getActiveTab", args: [] });
		return this.activeTab;
	}

	async getWatchTabs() {
		this.calls.push({ method: "getWatchTabs", args: [] });
		return this.watchTabs;
	}

	async getYouTubeTabs() {
		this.calls.push({ method: "getYouTubeTabs", args: [] });
		return this.youtubeTabs;
	}

	async sendMessage<T = unknown>(id: number, message: unknown) {
		this.calls.push({ method: "sendMessage", args: [id, message] });
		return this.messageResponse as T | undefined;
	}

	subscribeToTabChanges(onActivated: () => void, onUpdated: (url?: string) => void) {
		this.calls.push({ method: "subscribeToTabChanges", args: [] });
		this.tabChangeCleanup = () => {
			this.calls.push({ method: "unsubscribeFromTabChanges", args: [] });
		};
		void onActivated;
		void onUpdated;
		return this.tabChangeCleanup;
	}

	async closeTab(id: number) {
		this.calls.push({ method: "closeTab", args: [id] });
	}

	async openVideo(videoId: string, resumeAt?: number) {
		this.calls.push({ method: "openVideo", args: [videoId, resumeAt] });
	}

	async openSidePanel() {
		this.calls.push({ method: "openSidePanel", args: [] });
	}

	async getNowPlayingTab() {
		this.calls.push({ method: "getNowPlayingTab", args: [] });
		return this.nowPlayingTab;
	}
}
