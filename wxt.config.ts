import { defineConfig } from "wxt";

export default defineConfig({
	srcDir: "src",
	modules: ["@wxt-dev/module-svelte"],
	manifest: {
		name: "TubePark — Frictionless Visual Scratchpad for YouTube",
		version: "0.1.0",
		description:
			"Convert a horizontal tab-bar mess into a vertical, thumbnail-rich queue.",
		permissions: ["storage", "contextMenus", "tabs", "sidePanel"],
		host_permissions: ["*://*.youtube.com/*"],
		action: {
			default_title: "TubePark",
		},
		side_panel: {
			default_path: "sidepanel.html",
		},
	},
	dev: {
		reloadCommand: "Ctrl+R",
	},
});
