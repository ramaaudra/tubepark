# Chrome Web Store Listing — TubePark — Frictionless Visual Scratchpad for YouTube

> Last Updated: 2026-08-21

## Store Listing

**Extension Name** [REQUIRED]

TubePark — Frictionless Visual Scratchpad for YouTube

**Short Description** [REQUIRED]

Turn open YouTube tabs into a visual watch-later queue with thumbnails, titles, and channels.

**Detailed Description** [REQUIRED]

TubePark turns open YouTube tabs into a visual watch-later queue, so you can close tab clutter without losing the context of what you wanted to watch.

Park videos directly from YouTube, save the current tab from the popup, or collect your other open YouTube tabs in one action. Every queued video keeps its thumbnail, title, and channel so the list stays easy to scan.

Open the TubePark popup for quick actions or use the Side Panel as a persistent workspace. Pin videos for Up Next, group the queue by time or channel, search your saved videos, and reopen a video when you are ready to watch. A capacity meter helps you curate the queue before it becomes clutter of its own.

To use TubePark, open YouTube and hover a video card to park it, or open the extension popup to park the current tab. Open the Side Panel to review and organize your queue.

TubePark is designed for YouTube only. Your queue stays on your device, TubePark does not use accounts or analytics, and it does not send your queue to a developer-operated server.

For support or feedback, visit the project page: https://github.com/ramaaudra/tubepark

**Category** [REQUIRED]

Productivity

**Single Purpose** [REQUIRED]

Save and organize YouTube videos in a local visual watch-later queue.

**Primary Language** [REQUIRED]

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `public/icon/128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Needs update | `docs/images/sidepanel.webp` (current source is 1024×768) |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs update | `docs/images/popup.webp` (current source is 1024×768) |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | `docs/images/tubepark-promo-440x280.png` |
| Small Promo Tile — dark | 440×280 | ✅ Ready | `docs/images/tubepark-promo-440x280-dark.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | — |

### Screenshot Notes

Create at least one current screenshot at 1280×800 or 640×400. The primary screenshot should show the Side Panel with a populated visual queue, the capacity meter, and a visible organization action. A second screenshot should show the popup parking the current YouTube tab. Do not include browser chrome or claims that are not visible in the current product.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores the user's parked-video queue and the short-lived pending removal needed for the five-second Undo action on the user's device. |
| `contextMenus` | permissions | Adds a “Park this video” action when the user right-clicks a YouTube video link. |
| `sidePanel` | permissions | Opens TubePark's persistent queue workspace in Chrome's Side Panel. |
| `alarms` | permissions | Provides a lifecycle-safe recovery signal so a pending removal can be committed if the background worker is restarted; it is not used for tracking or notifications. |
| `*://*.youtube.com/*` | host_permissions | Runs the park controls on YouTube pages and lets the extension identify and read metadata from YouTube videos the user chooses to park. |
| `*://youtu.be/*` | host_permissions | Keeps shortened YouTube video links supported when the user opens or parks them. |

## Privacy & Data Use

TubePark handles user-selected YouTube video metadata locally: video ID, title, channel, timestamps, and optional playback position. This data is used only to display and reopen the user's queue. It is not transmitted to a developer-operated server, sold, or shared with third parties.

The extension does not use accounts, analytics, advertising, tracking, or `chrome.storage.sync`. Tab URLs and titles are read only for matching YouTube tabs needed by the parking and reopen flows. Thumbnail images are loaded by the browser from YouTube when displayed; TubePark does not store thumbnail files.

### Data Collection Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

https://github.com/ramaaudra/tubepark/blob/main/PRIVACY.md

Confirm the final public branch and URL before submission.

## Distribution

**Visibility**: Public<br>
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

ramaaudra

**Contact Email** [REQUIRED]

ramaaudra30.ra@gmail.com

**Support URL / Email** [RECOMMENDED]

https://github.com/ramaaudra/tubepark/issues

**Homepage URL** [RECOMMENDED]

https://github.com/ramaaudra/tubepark

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.4.1 | 2026-08-21 | Durable five-second Undo recovery, YouTube-only tab access, and release validation improvements. | Draft |

## Review Notes

### Known Issues / Limitations

- TubePark is intentionally limited to YouTube and shortened YouTube links.
- Chrome 114 or newer is required because TubePark uses the Side Panel.
- Resize or recapture the current UI screenshots to one of Chrome Web Store's accepted dimensions before submission.
- The GitHub Actions publish job requires the `chrome-web-store-publish` environment with an approval rule and the four Chrome Web Store secrets configured.

### Rejection History

No submissions yet.
