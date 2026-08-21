<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { getQueueState, parkVideo, requestRemoval, cancelRemoval, commitPending, type QueueState } from '../../shared/storage';
  import { extractYouTubeVideoId, cleanYouTubeTitle } from '../../shared/capture-predicates';
  import { MSG, type TabMeta } from '../../shared/messages';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import Icon from '../../components/Icon.svelte';
  import BrandMark from '../../components/BrandMark.svelte';
  import ParkMeter from '../../components/ParkMeter.svelte';
  import Equalizer from '../../components/Equalizer.svelte';
  import { parkIn, parkOut } from '../../components/transitions';
  import { flyChip } from '../../components/fly-chip';
  import type { ParkedVideo, CapacityState } from '../../shared/types';
  import { getParkableOtherTabCount, getParkAllLabel } from '../../shared/ui-helpers';

  const FALLBACK_META: TabMeta = { channel: 'YouTube', currentTime: 0 };

  /** Ask the content script on a YouTube tab for channel + currentTime (G4+F4).
   * Falls back to `{ channel: 'YouTube', currentTime: 0 }` when the CS is not
   * loaded yet (tab still loading) or chrome.runtime.lastError fires. */
  function fetchTabMeta(tabId: number): Promise<TabMeta> {
    return tabOps.sendMessage<TabMeta>(tabId, { type: MSG.GET_TAB_META }).then((resp) => {
      if (!resp || typeof resp !== 'object') return FALLBACK_META;
      const channel = typeof resp.channel === 'string' && resp.channel
        ? resp.channel
        : FALLBACK_META.channel;
      const currentTime = typeof resp.currentTime === 'number'
        ? Math.floor(resp.currentTime)
        : 0;
      return { channel, currentTime };
    });
  }

  /** Build a ParkedVideo for tab-park: title from the tab, channel + optional
   * resumeAt from GET_TAB_META. Omits resumeAt when currentTime is 0 (F4). */
  function parkedFromTab(
    videoId: string,
    tabTitle: string | undefined,
    meta: TabMeta,
  ): ParkedVideo {
    const payload: ParkedVideo = {
      id: videoId,
      title: cleanYouTubeTitle(tabTitle || 'YouTube Video'),
      channel: meta.channel,
      addedAt: Date.now(),
    };
    if (meta.currentTime > 0) payload.resumeAt = meta.currentTime;
    return payload;
  }

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let openWatchTabCount = $state<number>(0);
  let currentTabIsWatch = $state<boolean>(false);
  let currentTabInfo = $state<{ id?: number; title?: string; url?: string } | null>(null);
  let nowPlaying = $state<NowPlayingTab | null>(null);
  let pendingCount = $state(0);
  let pendingVideos = $state<ParkedVideo[]>([]);
  let pendingOperationId = $state<string | null>(null);
  let pendingRemovalRequest: Promise<QueueState> | null = null;
  let loadGeneration = 0;

  let reduced = $state(false);
  let loading = $state(true);
  let loadError = $state(false);
  let hydrated = $state(false);
  let animateItems = $state(false);
  let actionBusy = $state(false);
  let actionFeedback = $state<{ tone: 'success' | 'warning' | 'danger'; message: string } | null>(null);
  let parkBtnEl = $state<HTMLButtonElement | null>(null);
  let parkAllBtnEl = $state<HTMLButtonElement | null>(null);
  let listAnchorEl = $state<HTMLElement | null>(null);

  function applyState(state: QueueState) {
    queue = state.queue;
    capacity = state.capacity;
    if (state.pending) {
      pendingCount = state.pending.count;
      pendingOperationId = state.pending.operationId;
    } else {
      pendingCount = 0;
      pendingOperationId = null;
      pendingVideos = [];
    }
  }

  async function loadData(showLoading = !hydrated) {
    const generation = ++loadGeneration;
    if (showLoading) loading = true;
    try {
      const state = await getQueueState('popup');
      if (generation !== loadGeneration) return;
      applyState(state);

      const activeTab = await tabOps.getActiveTab();
      if (generation !== loadGeneration) return;
      currentTabInfo = activeTab;
      currentTabIsWatch = activeTab !== null && extractYouTubeVideoId(activeTab.url) !== null;

      const watchTabs = await tabOps.getWatchTabs();
      if (generation !== loadGeneration) return;
      openWatchTabCount = watchTabs.length;

      nowPlaying = await tabOps.getNowPlayingTab();
      if (generation !== loadGeneration) return;
      loadError = false;
	    } catch {
	      if (generation === loadGeneration) loadError = true;
	    } finally {
	      if (showLoading && generation === loadGeneration) {
	        loading = false;
	        hydrated = true;
	      }
    }
  }

  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void (async () => {
      await loadData();
      await tick();
      animateItems = true;
    })();
    const storageListener = () => void loadData();
    const messageListener = (message: { type?: string }) => {
      if (message.type !== MSG.PENDING_REMOVAL_CHANGED) return false;
      void loadData(false);
      return false;
    };
    const commitPendingOnClose = () => {
      if (pendingCount > 0 && pendingOperationId) void commitPending(pendingOperationId, 'popup');
    };
    chrome.storage?.onChanged.addListener(storageListener);
    chrome.runtime?.onMessage.addListener(messageListener);
    window.addEventListener('blur', commitPendingOnClose);
    window.addEventListener('pagehide', commitPendingOnClose);
    return () => {
      chrome.storage?.onChanged.removeListener(storageListener);
      chrome.runtime?.onMessage.removeListener(messageListener);
      window.removeEventListener('blur', commitPendingOnClose);
      window.removeEventListener('pagehide', commitPendingOnClose);
    };
  });

  function launchChip(from: Element | null, label?: string) {
    if (!from || !listAnchorEl) return;
    flyChip(from, listAnchorEl, { reduced, label });
  }

  async function handleParkCurrentTab() {
    if (actionBusy || !currentTabInfo?.url) return;
    const videoId = extractYouTubeVideoId(currentTabInfo.url);
    if (!videoId) return;

    actionBusy = true;
    actionFeedback = null;
    try {
      const meta = currentTabInfo.id
        ? await fetchTabMeta(currentTabInfo.id)
        : FALLBACK_META;
      const result = await parkVideo(
        parkedFromTab(videoId, currentTabInfo.title, meta),
      );

      if (result.success || result.duplicate) {
        launchChip(parkBtnEl);
        if (currentTabInfo.id) await tabOps.closeTab(currentTabInfo.id);
        actionFeedback = {
          tone: 'success',
          message: result.duplicate
            ? 'Already in your queue; tab closed.'
            : 'Parked this tab and closed it.',
        };
      } else if (result.full) {
        actionFeedback = { tone: 'warning', message: 'Queue is full. Remove an older video first.' };
      } else {
        actionFeedback = { tone: 'danger', message: 'Could not park this tab. Try again.' };
      }
    } catch {
      actionFeedback = { tone: 'danger', message: 'Could not park this tab. Try again.' };
    } finally {
      await loadData();
      actionBusy = false;
    }
  }

  async function handleParkAll() {
    if (actionBusy) return;

    actionBusy = true;
    actionFeedback = null;
    try {
      // Delegate to background service worker so the process survives popup close.
      const result = await new Promise<{ parked: number; reachedCapacity: boolean; error?: boolean }>((resolve) => {
        chrome.runtime?.sendMessage({ type: MSG.PARK_ALL_OTHER_TABS }, (res) => {
          if (chrome.runtime?.lastError || !res || typeof res !== 'object') {
            resolve({ parked: 0, reachedCapacity: false, error: true });
          } else {
            resolve(res as { parked: number; reachedCapacity: boolean; error?: boolean });
          }
        });
      });

      const { parked, reachedCapacity, error } = result;

      if (parked > 0) launchChip(parkAllBtnEl, `\u00d7${parked}`);

      if (error) {
        actionFeedback = { tone: 'danger', message: 'Could not park the other tabs. Try again.' };
      } else if (reachedCapacity) {
        actionFeedback = {
          tone: 'warning',
          message: parked > 0
            ? `${parked} tab${parked === 1 ? '' : 's'} parked. Queue is now full.`
            : 'Queue is full. Remove an older video first.',
        };
      } else if (parked > 0) {
        actionFeedback = {
          tone: 'success',
          message: `${parked} YouTube tab${parked === 1 ? '' : 's'} parked.`,
        };
      } else {
        actionFeedback = { tone: 'danger', message: 'No other YouTube tabs could be parked.' };
      }
    } catch {
      actionFeedback = { tone: 'danger', message: 'Could not park the other tabs. Try again.' };
    } finally {
      await loadData();
      actionBusy = false;
    }
  }

  async function handleRemove(video: ParkedVideo) {
    const previous = queue;
    queue = queue.filter((item) => item.id !== video.id);
    capacity = { ...capacity, count: queue.length, percentage: (queue.length / capacity.max) * 100 };
    pendingVideos = [video];
    pendingCount = 1;
    pendingOperationId = null;
    try {
      const request = requestRemoval([video], 'popup');
      pendingRemovalRequest = request;
      const state = await request;
      applyState(state);
      pendingCount = state.pending?.count ?? 0;
      pendingOperationId = state.pending?.operationId ?? null;
    } catch {
      queue = previous;
      pendingVideos = [];
      pendingCount = 0;
      pendingOperationId = null;
    } finally {
      pendingRemovalRequest = null;
    }
  }

  async function handleUndo() {
    if (pendingRemovalRequest) await pendingRemovalRequest.catch(() => null);
    const operationId = pendingOperationId;
    if (!operationId) return;
    queue = [...queue, ...pendingVideos];
    pendingVideos = [];
    pendingCount = 0;
    pendingOperationId = null;
    applyState(await cancelRemoval(operationId, 'popup'));
  }

  async function handleOpenSidePanel() {
    await tabOps.openSidePanel();
    window.close();
  }

  async function handlePlay(video: ParkedVideo) {
    await tabOps.openVideo(video.id, video.resumeAt);
    window.close();
  }

  const recentItems = $derived(
    [...queue].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3)
  );

  const upNextCount = $derived(queue.filter((v) => v.pinned).length);
  const recentCount = $derived(queue.filter((v) => !v.pinned).length);
  const parkableOtherTabCount = $derived(
    getParkableOtherTabCount(openWatchTabCount, currentTabIsWatch),
  );
  const parkAllLabel = $derived(getParkAllLabel(currentTabIsWatch));

  /** Pick a display title for the now-playing tab. The live tab title wins;
   * when it's missing or the generic `YouTube` (tab still loading), fall back
   * to the parked entry's title (covers the park -> reopen-from-popup
   * navigation gap, since the queue is already in hand), then a neutral label.
   * Never the raw videoId. */
  function resolveNowPlayingTitle(tab: NowPlayingTab, parked: ParkedVideo[]): string {
    const fromTab = tab.title && tab.title !== 'YouTube' ? tab.title : '';
    const fromQueue = parked.find((v) => v.id === tab.videoId)?.title ?? '';
    return fromTab || fromQueue || 'YouTube video';
  }

  const nowPlayingTitle = $derived(
    nowPlaying ? resolveNowPlayingTitle(nowPlaying, queue) : ''
  );
</script>

<main class="popup-app">
  <header class="header">
    <div class="brand">
      <BrandMark size={26} />
      <span class="wordmark">TubePark</span>
    </div>
    <ParkMeter count={capacity.count} max={capacity.max} status={capacity.status} />
  </header>

  {#if capacity.status === 'warning' || capacity.status === 'full'}
    <div class="banner" class:banner-full={capacity.status === 'full'}>
      <Icon name="warning" size={16} />
      <span>
        {#if capacity.status === 'full'}
          Queue full ({capacity.count}/{capacity.max})
        {:else}
          Queue almost full ({capacity.count}/{capacity.max})
        {/if}
      </span>
    </div>
  {/if}

  <section class="actions" aria-busy={actionBusy}>
    <div class="tab-info">
      <Icon name="monitorPlay" size={15} />
      <span>{openWatchTabCount} YouTube video tab{openWatchTabCount === 1 ? '' : 's'} open</span>
    </div>

    <div class="buttons">
      {#if currentTabIsWatch}
        <button class="btn btn-primary" bind:this={parkBtnEl} onclick={handleParkCurrentTab} disabled={actionBusy}>
          <BrandMark size={16} />
          {actionBusy ? 'Parking…' : 'Park this tab & close'}
        </button>
      {/if}

      <button
        class="btn btn-secondary"
        bind:this={parkAllBtnEl}
        onclick={handleParkAll}
        disabled={actionBusy || parkableOtherTabCount === 0}
      >
        <Icon name="queue" size={15} />
        {actionBusy ? 'Parking…' : parkAllLabel}
      </button>
    </div>

    {#if actionFeedback}
      <div
        class="action-feedback"
        class:action-feedback-warning={actionFeedback.tone === 'warning'}
        class:action-feedback-danger={actionFeedback.tone === 'danger'}
        role={actionFeedback.tone === 'danger' ? 'alert' : 'status'}
        aria-live={actionFeedback.tone === 'danger' ? 'assertive' : 'polite'}
      >{actionFeedback.message}</div>
    {/if}
  </section>

  {#if nowPlaying}
    <section class="now-playing">
      <Equalizer />
      <div class="np-text">
        <span class="np-label">Now playing</span>
        <span class="np-title">{nowPlayingTitle}</span>
      </div>
    </section>
  {/if}

  <section class="queue">
    <div class="queue-head" bind:this={listAnchorEl}>
      <div class="counts">
        <span class="count-chip"><Icon name="pin" size={12} />{upNextCount} Up next</span>
        <span class="count-chip"><Icon name="clock" size={12} />{recentCount} Recent</span>
      </div>
      <button type="button" class="btn-link" onclick={handleOpenSidePanel}>
        <Icon name="sidebar" size={14} />
        Side panel
      </button>
    </div>

    {#if loading}
      <div class="loading-state" aria-busy="true">
        <BrandMark size={24} />
        <p>Loading your queue…</p>
      </div>
    {:else if loadError}
      <div class="load-error" role="alert">
        <p>Could not load your queue.</p>
        <button class="btn-link" onclick={() => void loadData(true)}>Retry</button>
      </div>
    {:else if recentItems.length === 0}
      <div class="empty">
        <BrandMark size={30} />
        <p>No videos parked yet</p>
        <span class="empty-sub">Hover a video on YouTube and click the park button</span>
      </div>
    {:else}
      <ul class="recent">
        {#each recentItems as video, i (video.id)}
          <li
            class="card"
            in:parkIn={{ delay: reduced ? 0 : i * 40, reduced, skip: !animateItems }}
            out:parkOut={{ reduced }}
            animate:flip={{ duration: reduced ? 0 : 300 }}
          >
            <button type="button" class="thumb" onclick={() => handlePlay(video)} aria-label="Play {video.title}">
              <Thumbnail videoId={video.id} channel={video.channel} altText={`Play ${video.title}`} />
            </button>
            <div class="card-body">
              <span class="card-title">{video.title}</span>
              <span class="card-meta">{video.channel}</span>
            </div>
            <button type="button" class="icon-btn danger" title="Remove" aria-label="Remove {video.title}" onclick={() => handleRemove(video)}>
              <Icon name="x" size={16} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if pendingCount > 0}
    <div class="undo-toast" transition:fly={{ y: reduced ? 0 : 24, duration: reduced ? 150 : 240, easing: cubicOut }}><span>Video removed</span><button type="button" disabled={!pendingOperationId} onclick={handleUndo}>Undo</button></div>
  {/if}
</main>

<style>
  .popup-app {
    width: 330px;
    background: var(--tp-bg);
    color: var(--tp-text);
    font-family: var(--tp-font);
    padding: 14px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--tp-border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .wordmark {
    font-weight: 800;
    font-size: 15px;
    letter-spacing: -0.02em;
    color: var(--tp-text);
  }

  .banner {
    margin-top: 10px;
    background: var(--tp-warn-bg);
    border: 1px solid var(--tp-warn-border);
    color: var(--tp-warn-text);
    padding: 8px 10px;
    border-radius: var(--tp-r-btn);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .banner.banner-full {
    background: var(--tp-danger-soft);
    border-color: var(--tp-danger);
    color: var(--tp-danger);
  }

  .actions {
    margin-top: 12px;
  }

  .tab-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--tp-text-2);
    margin-bottom: 8px;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action-feedback {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--tp-border);
    border-radius: var(--tp-r-btn);
    background: var(--tp-surface-2);
    color: var(--tp-text-2);
    font-size: 11px;
    line-height: 1.35;
  }

  .action-feedback-warning {
    background: var(--tp-warn-bg);
    border-color: var(--tp-warn-border);
    color: var(--tp-warn-text);
  }

  .action-feedback-danger {
    background: var(--tp-danger-soft);
    border-color: var(--tp-danger);
    color: var(--tp-danger);
  }

  .btn {
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 9px 12px;
    border-radius: var(--tp-r-btn);
    border: 1px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 40px;
    transition:
      transform var(--tp-dur-press) var(--tp-ease-snappy),
      background-color var(--tp-dur-micro) ease,
      box-shadow var(--tp-dur-micro) ease;
  }

  .btn:active {
    transform: scale(0.96);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-primary {
    background: var(--tp-accent);
    color: var(--tp-accent-contrast);
    box-shadow: var(--tp-shadow-card);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--tp-accent-hover);
  }

  .btn-secondary {
    background: var(--tp-surface);
    color: var(--tp-text);
    border-color: var(--tp-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--tp-surface-2);
  }

  .now-playing {
    margin-top: 12px;
    padding: 9px 11px;
    background: var(--tp-accent-soft);
    border: 1px solid var(--tp-border);
    border-radius: var(--tp-r-btn);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .np-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .np-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--tp-accent);
  }

  .np-title {
    font-size: 12px;
    color: var(--tp-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .queue {
    margin-top: 16px;
    border-top: 1px solid var(--tp-border);
    padding-top: 12px;
  }

  .queue-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .counts {
    display: flex;
    gap: 6px;
  }

  .count-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--tp-text-2);
    background: var(--tp-surface);
    border: 1px solid var(--tp-border);
    padding: 3px 8px;
    border-radius: var(--tp-r-chip);
    font-variant-numeric: tabular-nums;
  }

  .btn-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: var(--tp-accent);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    min-height: 40px;
    padding: 8px;
    border-radius: var(--tp-r-btn);
    transition:
      color var(--tp-dur-micro) ease,
      background-color var(--tp-dur-micro) ease,
      transform var(--tp-dur-press) var(--tp-ease-snappy);
  }

  .btn-link:hover {
    color: var(--tp-accent-hover);
    background: var(--tp-surface-2);
  }

  .btn-link:active {
    transform: scale(0.96);
  }

  .empty {
    text-align: center;
    padding: 18px 0 8px;
    color: var(--tp-text-3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .empty p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--tp-text-2);
    font-weight: 500;
  }

  .empty-sub {
    font-size: 11px;
  }

  .loading-state,
  .load-error {
    min-height: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    color: var(--tp-text-2);
  }

  .loading-state p,
  .load-error p {
    margin: 0;
    font-size: 12px;
  }

  .load-error {
    color: var(--tp-danger);
  }

  .recent {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .card {
    background: var(--tp-surface);
    border: 1px solid var(--tp-border);
    border-radius: var(--tp-r-card);
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: var(--tp-shadow-card);
    transition:
      transform var(--tp-dur-micro) var(--tp-ease-gentle),
      box-shadow var(--tp-dur-micro) ease,
      border-color var(--tp-dur-micro) ease;
  }

  .card:hover {
    box-shadow: var(--tp-shadow-lift);
    border-color: var(--tp-accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover { transform: translateY(-2px); }
  }

  .thumb {
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 6px;
    line-height: 0;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .card-title {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--tp-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-meta {
    font-size: 11px;
    color: var(--tp-text-3);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--tp-text-3);
    cursor: pointer;
    width: 40px;
    min-height: 40px;
    padding: 0;
    border-radius: 6px;
    flex-shrink: 0;
    transition:
      color var(--tp-dur-micro) ease,
      background-color var(--tp-dur-micro) ease,
      transform var(--tp-dur-press) var(--tp-ease-snappy);
  }

  .icon-btn:active {
    transform: scale(0.96);
  }

  .undo-toast {
    position: fixed; left: 14px; right: 14px; bottom: 14px; z-index: 20;
    display: flex; justify-content: space-between; padding: 10px 14px;
    border-radius: var(--tp-r-btn); background: var(--tp-text); color: var(--tp-bg);
    font-size: 12px; box-shadow: var(--tp-shadow-lift);
  }
  .undo-toast button { border: 0; background: none; color: var(--tp-accent); font-weight: 700; cursor: pointer; }

  .btn:focus-visible,
  .btn-link:focus-visible,
  .thumb:focus-visible,
  .icon-btn:focus-visible,
  .undo-toast button:focus-visible {
    outline: 2px solid var(--tp-accent);
    outline-offset: 2px;
  }

  .icon-btn.danger:hover {
    color: var(--tp-danger);
    background: var(--tp-danger-soft);
  }
</style>
