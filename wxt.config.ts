import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-svelte"],
	manifest: {
		name: "TubePark — Frictionless Visual Scratchpad for YouTube",
		version: "0.2.2",
		description:
			"Convert a horizontal tab-bar mess into a vertical, thumbnail-rich queue.",
		permissions: ["storage", "contextMenus", "tabs", "sidePanel"],
		host_permissions: ["*://*.youtube.com/*"],
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
