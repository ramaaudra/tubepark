# ADR 0004: Migrate Build System to WXT

## Status
Accepted (2026-07-17)

## Context
TubePark's build, manifest, and entry-point wiring were hand-rolled: a custom multi-entry `vite.config.ts` with `rollupOptions`, a static `public/manifest.json`, and a bespoke `scripts/dev.js` that spawned Chrome via `--load-extension`. This works but requires manual maintenance of MV3 entry conventions, manifest generation, and the dev/reload loop.

WXT is a browser-extension framework that owns the build pipeline, manifest generation, and entrypoint conventions. It provides first-class dev tooling (auto-opened Chrome, hot reload, `wxt zip`) without custom glue code.

## Decision
Adopt WXT to own the build/manifest/entrypoint pipeline. Raw `chrome.*` APIs (`chrome.storage.local`, `chrome.alarms`, `chrome.runtime`, `chrome.contextMenus`) are deliberately retained instead of switching to WXT's storage or `browser` (webextension-polyfill) helpers.

Rationale for keeping raw `chrome.*`:
- Existing users have persisted data in `chrome.storage.local` under the `tubepark_queue` key — swapping to WXT's storage abstraction would add migration risk with zero functional benefit.
- The alarm/expiry logic is already tested and working (see ADR 0002) — wrapping it in another layer adds complexity without value.
- WXT's `browser` (webextension-polyfill) provides cross-browser compatibility, but TubePark targets Chrome MV3 only.

## Consequences
- `wxt dev` auto-opens Chrome, replacing `scripts/dev.js`.
- `wxt build` generates the manifest from `wxt.config.ts`, replacing `vite.config.ts` + `public/manifest.json`.
- Entry points live under `src/entrypoints/` with WXT wrapper functions (`defineBackground`, `defineContentScript`), making entry discovery convention-based rather than rollup-input-driven.
- Shared domain code in `src/shared/` is consumed unchanged — WXT treats non-entrypoint code as shared utils.
- All domain behaviour (park, expiry, grouping, capacity, thumbnail strategy) remains byte-for-byte identical.

## Alternatives considered
- Keep hand-rolled Vite build: rejected — puts MV3 entry conventions, manifest, and dev tooling maintenance entirely on us.
- Adopt WXT + WXT storage wrapper: rejected — no benefit for a Chrome-only extension with persisted user data.
- Migrate to another framework (e.g. Plasmo): rejected — WXT chosen for its Svelte module, active maintenance, and minimal migration surface.

## References
- ADR 0001: Context Menu Scoping
- ADR 0002: Expiry Alarms (Alarm API)
- ADR 0003: Thumbnails Dynamic
