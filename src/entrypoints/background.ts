import { defineBackground } from "wxt/utils/define-background";
import { parkVideo } from "../shared/storage";
import { extractYouTubeVideoId } from "../shared/capture-predicates";

const CONTEXT_MENU_ID = "tubepark-park-context-menu";

export default defineBackground(() => {
	console.log("[TubePark] Background Service Worker initialized");

	if (typeof chrome !== "undefined" && chrome.runtime) {
		chrome.runtime.onInstalled.addListener(() => {
			if (chrome.contextMenus) {
				chrome.contextMenus.create({
					id: CONTEXT_MENU_ID,
					title: "Park This Video",
					contexts: ["link"],
					targetUrlPatterns: ["*://*.youtube.com/watch*"],
				});
			}
		});

		if (chrome.contextMenus) {
			chrome.contextMenus.onClicked.addListener(async (info, tab) => {
				if (info.menuItemId === CONTEXT_MENU_ID && info.linkUrl) {
					const videoId = extractYouTubeVideoId(info.linkUrl);
					if (!videoId) return;

					// Route through content script for metadata + feedback
					if (tab?.id) {
						chrome.tabs.sendMessage(tab.id, {
							type: "CONTEXT_MENU_PARK",
							videoId,
							linkUrl: info.linkUrl,
						});
					}
				}
			});
		}

		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.type === "PARK_VIDEO_REQUEST") {
				(async () => {
					const result = await parkVideo(message.payload);
					sendResponse(result);
				})();
				return true;
			}
			return false;
		});
	}
});
