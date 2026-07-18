<script lang="ts">
  import { onMount } from 'svelte';
  import { getQueue, getCapacity, parkVideo, removeVideo } from '../../shared/storage';
  import { extractYouTubeVideoId } from '../../shared/capture-predicates';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import type { ParkedVideo, CapacityState } from '../../shared/types';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let openWatchTabCount = $state<number>(0);
  let currentTabIsWatch = $state<boolean>(false);
  let currentTabInfo = $state<{ id?: number; title?: string; url?: string } | null>(null);
  let nowPlaying = $state<NowPlayingTab | null>(null);

  async function loadData() {
    queue = await getQueue();
    capacity = await getCapacity();

    const activeTab = await tabOps.getActiveTab();
    currentTabInfo = activeTab;
    currentTabIsWatch = activeTab !== null && extractYouTubeVideoId(activeTab.url) !== null;

    const watchTabs = await tabOps.getWatchTabs();
    openWatchTabCount = watchTabs.length;

    nowPlaying = await tabOps.getNowPlayingTab();
  }

  onMount(() => {
    loadData();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(loadData);
    }
  });

  async function handleParkCurrentTab() {
    if (!currentTabInfo?.url) return;
    const videoId = extractYouTubeVideoId(currentTabInfo.url);
    if (!videoId) return;

    const title = (currentTabInfo.title || 'YouTube Video').replace('- YouTube', '').trim();
    const result = await parkVideo({
      id: videoId,
      title,
      channel: 'YouTube',
      addedAt: Date.now(),
    });

    if (result.success || result.duplicate) {
      if (currentTabInfo.id) await tabOps.closeTab(currentTabInfo.id);
    }
    await loadData();
  }

  async function handleParkAll() {
    const watchTabs = await tabOps.getWatchTabs();
    const activeTab = await tabOps.getActiveTab();

    for (const tab of watchTabs) {
      if (activeTab && tab.id === activeTab.id) continue;
      if (!tab.url) continue;
      const videoId = extractYouTubeVideoId(tab.url);
      if (!videoId) continue;

      const title = (tab.title || 'YouTube Video').replace('- YouTube', '').trim();
      const result = await parkVideo({
        id: videoId,
        title,
        channel: 'YouTube',
        addedAt: Date.now(),
      });

      if (result.success || result.duplicate) {
        if (tab.id) await tabOps.closeTab(tab.id);
      }
    }
    await loadData();
  }

  async function handleRemove(id: string) {
    queue = await removeVideo(id);
    capacity = await getCapacity();
  }

  async function handleOpenSidePanel() {
    await tabOps.openSidePanel();
    window.close();
  }

  async function handlePlay(videoId: string) {
    await tabOps.openVideo(videoId);
    window.close();
  }

  const recentItems = $derived(
    [...queue].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3)
  );

  const upNextCount = $derived(queue.filter((v) => v.pinned).length);
  const baruCount = $derived(queue.filter((v) => !v.pinned).length);
</script>

<main class="popup-app">
  <header class="header">
    <div class="brand">
      <div class="logo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <span class="title">TubePark</span>
    </div>
    <div class="count-badge" class:warning={capacity.status === 'warning'} class:full={capacity.status === 'full'}>
      {capacity.count}/{capacity.max}
    </div>
  </header>

  {#if capacity.status === 'warning' || capacity.status === 'full'}
    <div class="warning-banner" class:banner-full={capacity.status === 'full'}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V10h2v2z"/>
      </svg>
      <span>
        {#if capacity.status === 'full'}
          Queue Penuh! Harap tonton atau hapus video.
        {:else}
          Queue hampir penuh ({capacity.count}/{capacity.max})
        {/if}
      </span>
    </div>
  {/if}

  <section class="actions-section">
    <div class="tab-info-row">
      <span class="tab-icon">📺</span>
      <span class="tab-stat">{openWatchTabCount} tab video YouTube terbuka</span>
    </div>

    <div class="button-group">
      {#if currentTabIsWatch}
        <button class="btn btn-primary" onclick={handleParkCurrentTab}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
          Park Tab Ini & Tutup
        </button>
      {/if}

      <button
        class="btn btn-secondary"
        onclick={handleParkAll}
        disabled={openWatchTabCount === 0}
      >
        Park Semua Tab YT
      </button>
    </div>
  </section>

  {#if nowPlaying}
    <section class="now-playing-section">
      <span class="np-label">▶ Now Playing</span>
      <span class="np-title">{queue.find((v) => v.id === nowPlaying?.videoId)?.title ?? nowPlaying.videoId}</span>
    </section>
  {/if}

  <section class="queue-section">
    <div class="section-header">
      <h2>📌 {upNextCount} Up Next • 📅 {baruCount} Baru</h2>
      <button class="btn-text" onclick={handleOpenSidePanel}>
        Side Panel &rarr;
      </button>
    </div>

    {#if recentItems.length === 0}
      <div class="empty-state">
        <p>Belum ada video di-park</p>
        <span class="subtext">Hover video di YouTube, klik 📌</span>
      </div>
    {:else}
      <ul class="recent-list">
        {#each recentItems as video (video.id)}
          <li class="item-card">
            <div class="thumb-wrapper" onclick={() => handlePlay(video.id)}>
              <Thumbnail videoId={video.id} channel={video.channel} />
            </div>
            <div class="item-details">
              <span class="item-title">{video.title}</span>
              <span class="item-channel">{video.channel}</span>
            </div>
            <button
              class="btn-remove"
              title="Remove"
              onclick={() => handleRemove(video.id)}
            >
              &times;
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  :global(:root) {
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }

  .popup-app {
    width: 330px;
    background-color: #0f0f12;
    color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    padding: 14px;
    box-sizing: border-box;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #27272a;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo {
    width: 28px;
    height: 28px;
    background: linear-gradient(135deg, #ff0000, #cc0000);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .title {
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.02em;
  }

  .count-badge {
    background-color: #27272a;
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;

    &.warning {
      background-color: #451a03;
      color: #fde047;
    }
    &.full {
      background-color: #450a0a;
      color: #fca5a5;
    }
  }

  .warning-banner {
    margin-top: 10px;
    background-color: #451a03;
    border: 1px solid #78350f;
    color: #fde047;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;

    &.banner-full {
      background-color: #450a0a;
      border-color: #7f1d1d;
      color: #fca5a5;
    }
  }

  .actions-section {
    margin-top: 12px;
  }

  .tab-info-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #a1a1aa;
    margin-bottom: 8px;
  }

  .button-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn {
    font-family: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-out);

    &:active {
      transform: scale(0.97);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
  }

  .btn-primary {
    background-color: #ff0000;
    color: white;

    &:hover:not(:disabled) {
      background-color: #dc2626;
    }
  }

  .btn-secondary {
    background-color: #27272a;
    color: #e4e4e7;

    &:hover:not(:disabled) {
      background-color: #3f3f46;
    }
  }

  .now-playing-section {
    margin-top: 12px;
    padding: 8px 10px;
    background-color: #1c1114;
    border: 1px solid #7f1d1d;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .np-label {
    font-size: 10px;
    font-weight: 700;
    color: #ef4444;
    text-transform: uppercase;
  }

  .np-title {
    font-size: 12px;
    color: #f4f4f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .queue-section {
    margin-top: 16px;
    border-top: 1px solid #27272a;
    padding-top: 12px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;

    h2 {
      font-size: 12px;
      font-weight: 600;
      color: #a1a1aa;
      margin: 0;
    }
  }

  .btn-text {
    background: none;
    border: none;
    color: #ff4d4d;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  }

  .empty-state {
    text-align: center;
    padding: 16px 0;
    color: #71717a;

    p {
      margin: 0;
      font-size: 13px;
    }
    .subtext {
      font-size: 11px;
    }
  }

  .recent-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .item-card {
    background-color: #18181b;
    border: 1px solid #27272a;
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 10px;

    &:hover {
      background-color: #27272a;
    }
  }

  .thumb-wrapper {
    cursor: pointer;
    flex-shrink: 0;
  }

  .item-details {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .item-title {
    font-size: 12px;
    font-weight: 500;
    color: #f4f4f5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-channel {
    font-size: 11px;
    color: #a1a1aa;
  }

  .btn-remove {
    background: none;
    border: none;
    color: #71717a;
    font-size: 16px;
    cursor: pointer;
    padding: 0 4px;
    flex-shrink: 0;

    &:hover {
      color: #ef4444;
    }
  }
</style>
