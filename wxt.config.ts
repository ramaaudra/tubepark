import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-svelte"],
	manifest: {
		name: "TubePark — Frictionless Visual Scratchpad for YouTube",
		version: "0.4.1",
		minimum_chrome_version: "114",
		description:
			"Convert a horizontal tab-bar mess into a vertical, thumbnail-rich queue.",
		permissions: ["storage", "contextMenus", "sidePanel", "alarms"],
		host_permissions: ["*://*.youtube.com/*", "*://youtu.be/*"],
		icons: {
			16: "/icon/16.png",
			32: "/icon/32.png",
			48: "/icon/48.png",
			128: "/icon/128.png",
		},
		action: {
			default_title: "TubePark",
			default_icon: {
				16: "/icon/16.png",
				32: "/icon/32.png",
				48: "/icon/48.png",
				128: "/icon/128.png",
			},
		},
		side_panel: {
			default_path: "sidepanel.html",
		},
	},
	dev: {
		reloadCommand: "Ctrl+R",
	},
	webExt: {
		startUrls: ["https://www.youtube.com/@bridgemindai/videos"],
	},
});
