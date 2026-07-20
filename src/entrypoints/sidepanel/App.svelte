<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import {
    getQueue,
    getCapacity,
    removeVideo,
    removeManyVideos,
    togglePinned,
  } from '../../shared/storage';
  import { groupAndSortVideos, formatAgeBadge } from '../../shared/grouping';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import Icon from '../../components/Icon.svelte';
  import ParkBadge from '../../components/ParkBadge.svelte';
  import ParkMeter from '../../components/ParkMeter.svelte';
  import Equalizer from '../../components/Equalizer.svelte';
  import { parkIn, parkOut } from '../../components/transitions';
  import type { ParkedVideo, CapacityState } from '../../shared/types';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let nowPlaying = $state<NowPlayingTab | null>(null);
  let reduced = $state(false);

  let undoItem = $state<{ video: ParkedVideo; index: number } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  let undoBulk = $state<{ videos: ParkedVideo[]; fromIndex: number } | null>(null);

  async function loadData() {
    queue = await getQueue();
    capacity = await getCapacity();
    nowPlaying = await tabOps.getNowPlayingTab();
  }

  onMount(() => {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    loadData();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(loadData);
    }
    if (typeof chrome !== 'undefined' && chrome.tabs?.onActivated) {
      chrome.tabs.onActivated.addListener(() => loadData());
    }
  });

  async function handlePlay(video: ParkedVideo) {
    await tabOps.openVideo(video.id);
  }

  async function handleTogglePinned(id: string) {
    queue = await togglePinned(id);
  }

  async function handleRemove(video: ParkedVideo) {
    const index = queue.findIndex((v) => v.id === video.id);
    undoItem = { video, index };
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(async () => {
      queue = await removeVideo(video.id);
      capacity = await getCapacity();
      undoItem = null;
    }, 5000);
    queue = queue.filter((v) => v.id !== video.id);
    capacity = { ...capacity, count: capacity.count - 1 };
  }

  function handleUndo() {
    if (undoItem) {
      queue = [...queue.slice(0, undoItem.index), undoItem.video, ...queue.slice(undoItem.index)];
      capacity = { ...capacity, count: capacity.count + 1 };
      undoItem = null;
      if (undoTimer) clearTimeout(undoTimer);
    }
    if (undoBulk) {
      queue = [...queue.slice(0, undoBulk.fromIndex), ...undoBulk.videos, ...queue.slice(undoBulk.fromIndex)];
      capacity = { ...capacity, count: capacity.count + undoBulk.videos.length };
      undoBulk = null;
    }
  }

  async function handleRemoveAllOlder() {
    const olderIds = grouped.lebihLama.map((v) => v.id);
    if (olderIds.length === 0) return;

    const removedVideos = grouped.lebihLama;
    const fromIndex = queue.findIndex((v) => v.id === removedVideos[0].id);

    undoBulk = { videos: removedVideos, fromIndex };
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(async () => {
      queue = await removeManyVideos(olderIds);
      capacity = await getCapacity();
      undoBulk = null;
    }, 5000);

    const idSet = new Set(olderIds);
    queue = queue.filter((v) => !idSet.has(v.id));
    capacity = { ...capacity, count: capacity.count - olderIds.length };
  }

  const grouped = $derived(groupAndSortVideos(queue));
  const hasUndo = $derived(undoItem !== null || undoBulk !== null);
</script>

<main class="sidepanel-app">
  <header class="header">
    <div class="brand">
      <ParkBadge size={32} />
      <div class="brand-text">
        <h1 class="wordmark">TubePark</h1>
        <span class="tagline">Visual Scratchpad</span>
      </div>
    </div>
    <ParkMeter count={capacity.count} max={capacity.max} status={capacity.status} />
  </header>

  {#if capacity.status === 'warning' || capacity.status === 'full'}
    <div class="banner" class:banner-full={capacity.status === 'full'}>
      <Icon name="warning" size={16} />
      <span>
        {#if capacity.status === 'full'}
          Queue penuh ({capacity.count}/{capacity.max})! Selesaikan atau hapus video.
        {:else}
          Queue hampir penuh ({capacity.count}/{capacity.max})
        {/if}
      </span>
    </div>
  {/if}

  <div class="content">
    {#if queue.length === 0}
      <div class="empty">
        <ParkBadge size={48} />
        <h3>Scratchpad kosong</h3>
        <p>Hover video di YouTube dan tekan <kbd>P</kbd> untuk memarkirkannya. Atau klik kanan link video → <em>Park This Video</em>.</p>
      </div>
    {:else}
      {#if grouped.upNext.length > 0}
        <section class="group">
          <div class="group-label accent">
            <Icon name="pinFill" size={13} />
            <span>Up Next</span>
            <span class="group-count">{grouped.upNext.length}</span>
          </div>
          <div class="cards">
            {#each grouped.upNext as video (video.id)}
              <div
                class="card pinned"
                class:playing={nowPlaying?.videoId === video.id}
                in:parkIn={{ reduced }}
                out:parkOut={{ reduced }}
                animate:flip={{ duration: reduced ? 150 : 320 }}
              >
                {@render card(video, true)}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.baru.length > 0}
        <section class="group">
          <div class="group-label">
            <Icon name="clock" size={13} />
            <span>Baru</span>
            <span class="group-count">{grouped.baru.length}</span>
          </div>
          <div class="cards">
            {#each grouped.baru as video (video.id)}
              <div
                class="card"
                class:playing={nowPlaying?.videoId === video.id}
                in:parkIn={{ reduced }}
                out:parkOut={{ reduced }}
                animate:flip={{ duration: reduced ? 150 : 320 }}
              >
                {@render card(video, false)}
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.lebihLama.length > 0}
        <section class="group">
          <div class="group-label between">
            <span class="label-left">
              <Icon name="warning" size={13} />
              <span>Lebih Lama</span>
              <span class="group-count">{grouped.lebihLama.length}</span>
            </span>
            <button class="bulk-btn" onclick={handleRemoveAllOlder}>
              <Icon name="trash" size={13} />
              Hapus Semua
            </button>
          </div>
          <p class="stale-note">Sudah lebih dari 7 hari di queue — pangkas yang tidak relevan.</p>
          <div class="cards">
            {#each grouped.lebihLama as video (video.id)}
              <div
                class="card older"
                class:playing={nowPlaying?.videoId === video.id}
                in:parkIn={{ reduced }}
                out:parkOut={{ reduced }}
                animate:flip={{ duration: reduced ? 150 : 320 }}
              >
                {@render card(video, false)}
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if hasUndo}
    <div class="undo-toast" transition:fly={{ y: reduced ? 0 : 24, duration: reduced ? 150 : 300 }}>
      <span>Video dihapus</span>
      <button class="undo-btn" onclick={handleUndo}>Undo</button>
    </div>
  {/if}
</main>

{#snippet card(video: ParkedVideo, pinned: boolean)}
    <button
      class="thumb"
      onclick={() => handlePlay(video)}
      aria-label="Putar {video.title}"
    >
      <Thumbnail videoId={video.id} channel={video.channel} />
      <span class="play-overlay"><Icon name="play" size={22} /></span>
    </button>

    <div class="card-body">
      <h4 class="card-title" title={video.title}>{video.title}</h4>
      <span class="card-meta">
        {#if nowPlaying?.videoId === video.id}
          <Equalizer />
        {/if}
        {video.channel}{#if !pinned} • {formatAgeBadge(video)}{/if}
      </span>

      <div class="card-actions">
        <button class="pill play" onclick={() => handlePlay(video)}>
          <Icon name="play" size={13} /> Putar
        </button>
        <button class="pill" onclick={() => handleTogglePinned(video.id)}>
          <Icon name={pinned ? 'pinFill' : 'pin'} size={13} />
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        <button class="pill danger" onclick={() => handleRemove(video)}>
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
{/snippet}

<style>
  .sidepanel-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--tp-bg);
    color: var(--tp-text);
    font-family: var(--tp-font);
    box-sizing: border-box;
  }

  .header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--tp-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--tp-surface);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .wordmark {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0;
    line-height: 1.15;
    color: var(--tp-text);
  }

  .tagline {
    font-size: 11px;
    color: var(--tp-text-3);
  }

  .banner {
    margin: 12px 16px 0;
    background: var(--tp-warn-bg);
    border: 1px solid var(--tp-warn-border);
    color: var(--tp-warn-text);
    padding: 9px 12px;
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

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--tp-text-3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .empty h3 {
    font-size: 15px;
    color: var(--tp-text);
    margin: 6px 0 0;
  }

  .empty p {
    font-size: 13px;
    line-height: 1.55;
    margin: 0;
    color: var(--tp-text-2);
    max-width: 280px;
  }

  kbd {
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    background: var(--tp-surface-2);
    border: 1px solid var(--tp-border);
    border-radius: 4px;
    padding: 1px 6px;
    color: var(--tp-text-2);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .group-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--tp-text-2);
  }

  .group-label.accent {
    color: var(--tp-accent);
  }

  .group-label.between {
    justify-content: space-between;
  }

  .label-left {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .group-count {
    font-variant-numeric: tabular-nums;
    background: var(--tp-surface-2);
    border-radius: var(--tp-r-chip);
    padding: 0 6px;
    color: var(--tp-text-2);
  }

  .bulk-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: var(--tp-r-chip);
    border: 1px solid var(--tp-danger);
    background: transparent;
    color: var(--tp-danger);
    cursor: pointer;
    transition:
      background-color var(--tp-dur-micro) ease,
      transform var(--tp-dur-press) var(--tp-ease-snappy);
  }

  .bulk-btn:hover {
    background: var(--tp-danger-soft);
  }

  .bulk-btn:active {
    transform: scale(0.96);
  }

  .stale-note {
    font-size: 11.5px;
    color: var(--tp-text-3);
    margin: -4px 0 0;
    line-height: 1.4;
  }

  .cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .card {
    background: var(--tp-surface);
    border: 1px solid var(--tp-border);
    border-radius: var(--tp-r-card);
    padding: 10px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
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

  .card.pinned {
    border-color: var(--tp-accent);
    background: var(--tp-accent-soft);
  }

  .card.older {
    opacity: 0.72;
  }

  .card.older:hover {
    opacity: 1;
  }

  .card.playing {
    border-color: var(--tp-accent);
    box-shadow: 0 0 0 1px var(--tp-accent), var(--tp-shadow-card);
  }

  .thumb {
    position: relative;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 0;
    border-radius: 6px;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 6px;
    opacity: 0;
    transition: opacity var(--tp-dur-micro) ease;
  }

  .thumb:hover .play-overlay {
    opacity: 1;
  }

  .card-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--tp-text);
    margin: 0;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    font-size: 11px;
    color: var(--tp-text-3);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: var(--tp-r-chip);
    border: 1px solid var(--tp-border);
    background: var(--tp-surface);
    color: var(--tp-text-2);
    cursor: pointer;
    transition:
      background-color var(--tp-dur-micro) ease,
      color var(--tp-dur-micro) ease,
      border-color var(--tp-dur-micro) ease,
      transform var(--tp-dur-press) var(--tp-ease-snappy);
  }

  .pill:active {
    transform: scale(0.94);
  }

  .pill:hover {
    background: var(--tp-surface-2);
  }

  .pill.play {
    background: var(--tp-accent);
    color: var(--tp-accent-contrast);
    border-color: transparent;
  }

  .pill.play:hover {
    background: var(--tp-accent-hover);
  }

  .pill.danger {
    color: var(--tp-text-3);
    padding: 4px 7px;
  }

  .pill.danger:hover {
    color: var(--tp-danger);
    border-color: var(--tp-danger);
    background: var(--tp-danger-soft);
  }

  .undo-toast {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 16px;
    background: var(--tp-text);
    color: var(--tp-bg);
    padding: 10px 14px;
    border-radius: var(--tp-r-btn);
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: var(--tp-shadow-lift);
    z-index: 20;
  }

  .undo-btn {
    background: none;
    border: none;
    color: var(--tp-accent);
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }

  .undo-btn:hover {
    text-decoration: underline;
  }
</style>
