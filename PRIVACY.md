# Privacy Policy for TubePark

**Last updated:** 20 July 2026
**Effective date:** 20 July 2026

TubePark is a browser extension that turns open YouTube tabs into a local, thumbnail-rich watch-later queue. This policy explains what information the extension handles and what it does **not** do.

> **In short:** TubePark stores everything on your own device using your browser's local storage. It has no servers, no accounts, no analytics, and no tracking. The developer never receives, sees, or sells your data.

---

## 1. Information TubePark handles

When you park a video, TubePark saves a small metadata record for that video:

| Field | Example | Purpose |
| --- | --- | --- |
| Video ID | `dQw4w9WgXcQ` | Identify and reopen the video, and load its thumbnail |
| Title | `"Lofi beats to study to"` | Show what the video is in your queue |
| Channel | `"Lofi Girl"` | Add context to the queue item |
| Added-at timestamp | `1721433600000` | Sort and group your queue by recency |

To read this metadata, the extension also **temporarily accesses** the URLs and titles of your open browser tabs, so it can find YouTube videos to park and reopen them. This tab information is used in the moment and is **not** stored, logged, or transmitted anywhere.

TubePark does **not** collect, request, or store:

- Names, emails, accounts, or passwords (there is no sign-up)
- Payment or financial information
- Your YouTube watch history or account data
- Location, device identifiers, or advertising IDs
- Analytics, telemetry, or usage statistics
- Browsing activity on non-YouTube sites

---

## 2. How information is collected

- **Directly from your actions.** Metadata is captured only when you explicitly park a video — by clicking the park button on a video card, using the "Park This Video" right-click menu, or parking a tab from the popup.
- **Locally, within your browser.** The extension reads video-card and tab data using the browser's extension APIs on your device. Nothing is sent to a remote server owned or operated by the developer.

TubePark's own code makes **no network requests** — there is no `fetch`, no telemetry endpoint, and no external API that the extension calls.

---

## 3. How information is used

The metadata described above is used solely to:

- Display your watch-later queue with thumbnails, titles, and channels
- Reopen a parked video when you choose to watch it
- Sort and group items by how recently you parked them
- Enforce the queue's capacity limit

It is not used for any other purpose, and it never leaves your device by way of the extension.

---

## 4. Where your data is stored

All parked-video data is stored **on your device** in your browser's local extension storage (`chrome.storage.local`).

- It is not uploaded to any server.
- The developer has no access to it.
- If your browser has profile sync enabled, storage may be synced across your own devices **by your browser**, under your browser vendor's privacy policy — not by TubePark.

---

## 5. Third parties

TubePark does not share, sell, rent, or transfer your data to anyone. There are no third-party analytics, advertising, or tracking SDKs in the extension.

**One disclosure about thumbnails:** the queue shows each video's thumbnail image, loaded directly from YouTube's public image servers (`https://img.youtube.com/...`). When your browser displays a thumbnail, it makes an ordinary image request to Google/YouTube, which may receive your IP address and standard request information as it would for any image on the web. TubePark does not store thumbnail images and sends no additional data in these requests. This activity is governed by [Google's Privacy Policy](https://policies.google.com/privacy).

---

## 6. Permissions and why they are needed

TubePark requests only the permissions required for its single purpose — managing a YouTube watch-later queue:

| Permission | Why it is needed |
| --- | --- |
| `storage` | Save your parked-video queue locally on your device. |
| `tabs` | Read the URL/title of open tabs to park YouTube videos and reopen them. |
| `contextMenus` | Add the "Park This Video" option to the right-click menu on YouTube links. |
| `sidePanel` | Show your queue in the browser's side panel. |
| Host access to `*://*.youtube.com/*` | Detect video cards on YouTube pages so the park button can appear, and read a video's title and channel. |

TubePark requests **no access to any non-YouTube website**.

---

## 7. Data retention and deletion

You are in full control of your data:

- **Remove one item:** delete it from the popup or side panel.
- **Remove everything:** clear items from the queue, or **uninstall the extension** — uninstalling permanently deletes all TubePark data from your browser's local storage.

The developer retains nothing, because the developer never receives anything.

---

## 8. Your rights

Because all data stays on your device and is directly viewable and deletable by you within the extension, your rights to access, correct, and delete your data are satisfied at all times through the extension's own interface.

Depending on where you live, you may have additional statutory rights (for example under the EU **GDPR** or **California CCPA/CPRA**), such as the right to access, delete, or port your data, and the right to lodge a complaint with a data protection authority. Since TubePark does not collect or hold your data on any server, there is no server-side dataset for the developer to produce, correct, or erase on your behalf. If you have questions about your rights, contact us using the details below.

> [⚠️ LEGAL REVIEW REQUIRED] If you intend to formally claim GDPR/CCPA compliance or market to EU/California users at scale, have a privacy attorney confirm the wording of this section for your jurisdiction.

---

## 9. Children's privacy

TubePark is a general-purpose productivity tool and is not directed at children. It collects no personal information from anyone, including children under 13 (or the equivalent minimum age in your jurisdiction).

---

## 10. Security

TubePark stores data only in your browser's local extension storage and transmits none of it, which removes most categories of data-breach risk. The security of locally stored data ultimately depends on the security of your own device and browser profile. No method of storage is 100% secure.

---

## 11. Changes to this policy

If this policy changes, the "Last updated" date at the top will be revised and the updated version will be published in this repository. Material changes accompanying a new extension version will be noted in the release notes.

---

## 12. Contact

Questions about this policy or your privacy can be sent to:

- **Developer:** ramaaudra
- **Email:** ramaaudra30.ra@gmail.com
- **Project:** https://github.com/ramaaudra/tubepark

---

*This document is provided for transparency and does not constitute legal advice. For a binding, jurisdiction-specific policy, have it reviewed by a qualified data-privacy attorney.*
