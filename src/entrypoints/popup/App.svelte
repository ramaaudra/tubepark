<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { getQueueState, parkVideo, requestRemoval, cancelRemoval, type QueueState } from '../../shared/storage';
  import { extractYouTubeVideoId } from '../../shared/capture-predicates';
  import { MSG, type TabMeta } from '../../shared/messages';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import Icon from '../../components/Icon.svelte';
  import ParkBadge from '../../components/ParkBadge.svelte';
  import ParkMeter from '../../components/ParkMeter.svelte';
  import Equalizer from '../../components/Equalizer.svelte';
  import { parkIn, parkOut } from '../../components/transitions';
  import { flyChip } from '../../components/fly-chip';
  import type { ParkedVideo, CapacityState } from '../../shared/types';

  const FALLBACK_META: TabMeta = { channel: 'YouTube', currentTime: 0 };

  /** Ask the content script on a YouTube tab for channel + currentTime (G4+F4).
   * Falls back to `{ channel: 'YouTube', currentTime: 0 }` when the CS is not
   * loaded yet (tab still loading) or chrome.runtime.lastError fires. */
  function fetchTabMeta(tabId: number): Promise<TabMeta> {
    if (typeof chrome === 'undefined' || !chrome.tabs?.sendMessage) {
      return Promise.resolve(FALLBACK_META);
    }
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: MSG.GET_TAB_META }, (resp) => {
        if (chrome.runtime.lastError || !resp || typeof resp !== 'object') {
          resolve(FALLBACK_META);
          return;
        }
        const channel =
          typeof (resp as TabMeta).channel === 'string' && (resp as TabMeta).channel
            ? (resp as TabMeta).channel
            : FALLBACK_META.channel;
        const currentTime =
          typeof (resp as TabMeta).currentTime === 'number'
            ? Math.floor((resp as TabMeta).currentTime)
            : 0;
        resolve({ channel, currentTime });
      });
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
      title: (tabTitle || 'YouTube Video').replace('- YouTube', '').trim(),
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

  let reduced = $state(false);
  let parkBtnEl = $state<HTMLButtonElement | null>(null);
  let parkAllBtnEl = $state<HTMLButtonElement | null>(null);
  let listAnchorEl = $state<HTMLElement | null>(null);

  function applyState(state: QueueState) {
    queue = state.queue;
    capacity = state.capacity;
  }

  async function loadData() {
    applyState(await getQueueState());

    const activeTab = await tabOps.getActiveTab();
    currentTabInfo = activeTab;
    currentTabIsWatch = activeTab !== null && extractYouTubeVideoId(activeTab.url) !== null;

    const watchTabs = await tabOps.getWatchTabs();
    openWatchTabCount = watchTabs.length;

    nowPlaying = await tabOps.getNowPlayingTab();
  }

  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void loadData();
    const storageListener = () => void loadData();
    const commitPending = () => {
      if (pendingCount > 0) chrome.runtime?.sendMessage({ type: MSG.COMMIT_PENDING });
    };
    chrome.storage?.onChanged.addListener(storageListener);
    window.addEventListener('blur', commitPending);
    window.addEventListener('pagehide', commitPending);
    return () => {
      chrome.storage?.onChanged.removeListener(storageListener);
      window.removeEventListener('blur', commitPending);
      window.removeEventListener('pagehide', commitPending);
    };
  });

  function launchChip(from: Element | null, label?: string) {
    if (!from || !listAnchorEl) return;
    flyChip(from, listAnchorEl, { reduced, label });
  }

  async function handleParkCurrentTab() {
    if (!currentTabInfo?.url) return;
    const videoId = extractYouTubeVideoId(currentTabInfo.url);
    if (!videoId) return;

    const meta = currentTabInfo.id
      ? await fetchTabMeta(currentTabInfo.id)
      : FALLBACK_META;
    const result = await parkVideo(
      parkedFromTab(videoId, currentTabInfo.title, meta),
    );

    if (result.success || result.duplicate) {
      launchChip(parkBtnEl);
      if (currentTabInfo.id) await tabOps.closeTab(currentTabInfo.id);
    }
    await loadData();
  }

  async function handleParkAll() {
    const watchTabs = await tabOps.getWatchTabs();
    const activeTab = await tabOps.getActiveTab();

    let parked = 0;
    for (const tab of watchTabs) {
      if (activeTab && tab.id === activeTab.id) continue;
      if (!tab.url) continue;
      const videoId = extractYouTubeVideoId(tab.url);
      if (!videoId) continue;

      // One GET_TAB_META per tab (G4 channel + F4 currentTime). CS-miss → fallback.
      const meta = tab.id ? await fetchTabMeta(tab.id) : FALLBACK_META;
      const result = await parkVideo(parkedFromTab(videoId, tab.title, meta));

      if (result.success || result.duplicate) {
        parked += 1;
        if (tab.id) await tabOps.closeTab(tab.id);
      }
    }
    if (parked > 0) launchChip(parkAllBtnEl, `\u00d7${parked}`);
    await loadData();
  }

  async function handleRemove(video: ParkedVideo) {
    const previous = queue;
    queue = queue.filter((item) => item.id !== video.id);
    capacity = { ...capacity, count: queue.length, percentage: (queue.length / capacity.max) * 100 };
    pendingVideos = [video];
    pendingCount = 1;
    try {
      applyState(await requestRemoval([video]));
    } catch {
      queue = previous;
      pendingVideos = [];
      pendingCount = 0;
    }
  }

  async function handleUndo() {
    queue = [...queue, ...pendingVideos];
    pendingVideos = [];
    pendingCount = 0;
    applyState(await cancelRemoval());
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
  const baruCount = $derived(queue.filter((v) => !v.pinned).length);

  const nowPlayingTitle = $derived(
    nowPlaying ? (queue.find((v) => v.id === nowPlaying?.videoId)?.title ?? nowPlaying.videoId) : ''
  );
</script>

<main class="popup-app">
  <header class="header">
    <div class="brand">
      <ParkBadge size={26} />
      <span class="wordmark">TubePark</span>
    </div>
    <ParkMeter count={capacity.count} max={capacity.max} status={capacity.status} />
  </header>

  {#if capacity.status === 'warning' || capacity.status === 'full'}
    <div class="banner" class:banner-full={capacity.status === 'full'}>
      <Icon name="warning" size={16} />
      <span>
        {#if capacity.status === 'full'}
          Queue penuh! Tonton atau hapus video dulu.
        {:else}
          Queue hampir penuh ({capacity.count}/{capacity.max})
        {/if}
      </span>
    </div>
  {/if}

  <section class="actions">
    <div class="tab-info">
      <Icon name="monitorPlay" size={15} />
      <span>{openWatchTabCount} tab video YouTube terbuka</span>
    </div>

    <div class="buttons">
      {#if currentTabIsWatch}
        <button class="btn btn-primary" bind:this={parkBtnEl} onclick={handleParkCurrentTab}>
          <ParkBadge size={16} />
          Park Tab Ini & Tutup
        </button>
      {/if}

      <button
        class="btn btn-secondary"
        bind:this={parkAllBtnEl}
        onclick={handleParkAll}
        disabled={openWatchTabCount === 0}
      >
        <Icon name="queue" size={15} />
        Park Semua Tab YT
      </button>
    </div>
  </section>

  {#if nowPlaying}
    <section class="now-playing">
      <Equalizer />
      <div class="np-text">
        <span class="np-label">Now Playing</span>
        <span class="np-title">{nowPlayingTitle}</span>
      </div>
    </section>
  {/if}

  <section class="queue">
    <div class="queue-head" bind:this={listAnchorEl}>
      <div class="counts">
        <span class="count-chip"><Icon name="pin" size={12} />{upNextCount} Up Next</span>
        <span class="count-chip"><Icon name="clock" size={12} />{baruCount} Baru</span>
      </div>
      <button class="btn-link" onclick={handleOpenSidePanel}>
        <Icon name="sidebar" size={14} />
        Side Panel
      </button>
    </div>

    {#if recentItems.length === 0}
      <div class="empty">
        <ParkBadge size={30} />
        <p>Belum ada video di-park</p>
        <span class="empty-sub">Hover video di YouTube, tekan <kbd>P</kbd></span>
      </div>
    {:else}
      <ul class="recent">
        {#each recentItems as video, i (video.id)}
          <li
            class="card"
            in:parkIn={{ delay: reduced ? 0 : i * 40, reduced }}
            out:parkOut={{ reduced }}
            animate:flip={{ duration: reduced ? 150 : 300 }}
          >
            <button class="thumb" onclick={() => handlePlay(video)} aria-label="Putar {video.title}">
              <Thumbnail videoId={video.id} channel={video.channel} />
            </button>
            <div class="card-body">
              <span class="card-title">{video.title}</span>
              <span class="card-meta">{video.channel}</span>
            </div>
            <button class="icon-btn danger" title="Hapus" onclick={() => handleRemove(video)}>
              <Icon name="x" size={16} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if pendingCount > 0}
    <div class="undo-toast"><span>Video dihapus</span><button onclick={handleUndo}>Undo</button></div>
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
    padding: 0;
  }

  .btn-link:hover {
    color: var(--tp-accent-hover);
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

  kbd {
    font-family: inherit;
    font-size: 10px;
    font-weight: 700;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 4px;
    padding: 1px 5px;
    color: var(--tp-text-2);
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
    transform: translateY(-2px);
    box-shadow: var(--tp-shadow-lift);
    border-color: var(--tp-accent);
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
    padding: 4px;
    border-radius: 6px;
    flex-shrink: 0;
    transition:
      color var(--tp-dur-micro) ease,
      background-color var(--tp-dur-micro) ease,
      transform var(--tp-dur-press) var(--tp-ease-snappy);
  }

  .icon-btn:active {
    transform: scale(0.9);
  }

  .undo-toast {
    position: fixed; left: 14px; right: 14px; bottom: 14px; z-index: 20;
    display: flex; justify-content: space-between; padding: 10px 14px;
    border-radius: var(--tp-r-btn); background: var(--tp-text); color: var(--tp-bg);
    font-size: 12px; box-shadow: var(--tp-shadow-lift);
  }
  .undo-toast button { border: 0; background: none; color: var(--tp-accent); font-weight: 700; cursor: pointer; }

  .icon-btn.danger:hover {
    color: var(--tp-danger);
    background: var(--tp-danger-soft);
  }
</style>
