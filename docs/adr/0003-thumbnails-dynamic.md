# ADR 0003: Thumbnails Resolved Dynamically, Never Stored

## Status
Accepted (2026-07-17)

## Context
The lightweight mandate forbids Base64 image storage in `chrome.storage.local`. Thumbnails must therefore be referenced by URL (`img.youtube.com/vi/{id}/mqdefault.jpg`). This means thumbnails require network and are unavailable offline or for deleted/private videos.

## Decision
Never store image bytes. Resolve thumbnails at render time from the video ID. Svelte `<img onerror>` falls back to an elegant placeholder (channel initial / play icon). Text metadata (title, channel) is always available offline, so visual context degrades gracefully, not catastrophically.

## Consequences
- Storage stays tiny (metadata only), honouring the lightweight goal.
- Offline / deleted-video → placeholder, not broken image.
- Trade-off: no thumbnails offline. Accepted.

## Alternatives considered
- Cache thumbnails (blob) for N recent items: violates "no image in storage"; deferred as future candidate.
- Store Base64: rejected — bloats storage, contradicts core mandate.
