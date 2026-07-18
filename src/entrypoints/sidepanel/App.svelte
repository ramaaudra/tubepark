<script lang="ts">
  import { onMount } from 'svelte';
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
  import type { ParkedVideo, CapacityState } from '../../shared/types';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let nowPlaying = $state<NowPlayingTab | null>(null);

  // Undo state
  let undoItem = $state<{ video: ParkedVideo; index: number } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  let undoBulk = $state<{ videos: ParkedVideo[]; fromIndex: number } | null>(null);

  async function loadData() {
    queue = await getQueue();
    capacity = await getCapacity();
    nowPlaying = await tabOps.getNowPlayingTab();
  }

  onMount(() => {
    loadData();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(loadData);
    }
    // Refresh now playing when tab changes
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
    // Optimistic removal from local state
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

    // Optimistic removal
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
      <div class="logo">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <div>
        <h1 class="title">TubePark Workspace</h1>
        <span class="subtitle">Frictionless Visual Scratchpad</span>
      </div>
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
          Queue Penuh (200/200)! Harap selesaikan atau hapus video.
        {:else}
          Queue hampir penuh ({capacity.count}/{capacity.max})
        {/if}
      </span>
    </div>
  {/if}

  {#if hasUndo}
    <div class="undo-banner">
      <span>Video dihapus</span>
      <button class="undo-btn" onclick={handleUndo}>Undo</button>
    </div>
  {/if}

  <div class="content-body">
    {#if queue.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>Scratchpad Kosong</h3>
        <p>Hover video di YouTube, klik 📌 untuk memasukkannya ke queue. Atau klik kanan link video → "Park This Video".</p>
      </div>
    {:else}
      {#if grouped.upNext.length > 0}
        <section class="section">
          <div class="section-title pinned-title">
            <span>📌 Up Next ({grouped.upNext.length})</span>
          </div>

          <div class="video-list">
            {#each grouped.upNext as video (video.id)}
              <div class="video-card pinned-card" class:now-playing={nowPlaying?.videoId === video.id}>
                <div class="thumbnail-clickable" role="button" tabindex="0" onclick={() => handlePlay(video)} onkeydown={(e) => e.key === 'Enter' && handlePlay(video)}>
                  <Thumbnail videoId={video.id} channel={video.channel} />
                  <div class="play-overlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>

                <div class="video-info">
                  <h4 class="video-title" title={video.title}>{video.title}</h4>
                  <span class="video-channel">{video.channel}</span>

                  <div class="card-actions">
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>▶</button>
                    <button class="btn-action btn-toggle" title="Unpin" onclick={() => handleTogglePinned(video.id)}>Unpin</button>
                    <button class="btn-action btn-remove" title="Remove" onclick={() => handleRemove(video)}>✕</button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.baru.length > 0}
        <section class="section">
          <div class="section-title">
            <span>📅 Baru ({grouped.baru.length})</span>
          </div>

          <div class="video-list">
            {#each grouped.baru as video (video.id)}
              <div class="video-card" class:now-playing={nowPlaying?.videoId === video.id}>
                <div class="thumbnail-clickable" role="button" tabindex="0" onclick={() => handlePlay(video)} onkeydown={(e) => e.key === 'Enter' && handlePlay(video)}>
                  <Thumbnail videoId={video.id} channel={video.channel} />
                  <div class="play-overlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>

                <div class="video-info">
                  <h4 class="video-title" title={video.title}>{video.title}</h4>
                  <span class="video-channel">{video.channel} • {formatAgeBadge(video)}</span>

                  <div class="card-actions">
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>▶</button>
                    <button class="btn-action btn-toggle" title="Pin" onclick={() => handleTogglePinned(video.id)}>📌</button>
                    <button class="btn-action btn-remove" title="Remove" onclick={() => handleRemove(video)}>✕</button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.lebihLama.length > 0}
        <section class="section">
          <div class="section-title older-header">
            <span>⏳ Lebih Lama ({grouped.lebihLama.length})</span>
            <button class="btn-bulk-remove" onclick={handleRemoveAllOlder}>
              Hapus Semua
            </button>
          </div>

          <div class="older-warning">
            ⚠️ Sudah >7 hari di queue. Hapus yang tidak relevan?
          </div>

          <div class="video-list">
            {#each grouped.lebihLama as video (video.id)}
              <div class="video-card older-card" class:now-playing={nowPlaying?.videoId === video.id}>
                <div class="thumbnail-clickable" role="button" tabindex="0" onclick={() => handlePlay(video)} onkeydown={(e) => e.key === 'Enter' && handlePlay(video)}>
                  <Thumbnail videoId={video.id} channel={video.channel} />
                  <div class="play-overlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>

                <div class="video-info">
                  <h4 class="video-title" title={video.title}>{video.title}</h4>
                  <span class="video-channel">{video.channel} • {formatAgeBadge(video)}</span>

                  <div class="card-actions">
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>▶</button>
                    <button class="btn-action btn-toggle" title="Pin" onclick={() => handleTogglePinned(video.id)}>📌</button>
                    <button class="btn-action btn-remove" title="Remove" onclick={() => handleRemove(video)}>✕</button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>
</main>

<style>
  :global(:root) {
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #0f0f12;
  }

  .sidepanel-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background-color: #0f0f12;
    color: #f3f4f6;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    box-sizing: border-box;
  }

  .header {
    padding: 14px 16px;
    border-bottom: 1px solid #27272a;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #141417;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #ff0000, #cc0000);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .title {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 11px;
    color: #71717a;
  }

  .count-badge {
    background-color: #27272a;
    color: #a1a1aa;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
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
    margin: 12px 16px 0 16px;
    background-color: #451a03;
    border: 1px solid #78350f;
    color: #fde047;
    padding: 8px 12px;
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

  .undo-banner {
    margin: 8px 16px 0 16px;
    background-color: #1e293b;
    border: 1px solid #334155;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #cbd5e1;
  }

  .undo-btn {
    background: none;
    border: none;
    color: #60a5fa;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;

    &:hover {
      text-decoration: underline;
    }
  }

  .content-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #71717a;

    .empty-icon {
      font-size: 36px;
      margin-bottom: 12px;
    }

    h3 {
      font-size: 15px;
      color: #e4e4e7;
      margin: 0 0 8px 0;
    }

    p {
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #a1a1aa;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pinned-title {
    color: #facc15;
  }

  .older-header {
    color: #a1a1aa;
  }

  .older-warning {
    font-size: 11px;
    color: #a1a1aa;
    background-color: #1c1c1f;
    border-radius: 6px;
    padding: 6px 10px;
  }

  .btn-bulk-remove {
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #7f1d1d;
    background-color: transparent;
    color: #fca5a5;
    cursor: pointer;

    &:hover {
      background-color: #450a0a;
    }
  }

  .video-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .video-card {
    background-color: #18181b;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    transition: border-color 160ms var(--ease-out);

    &:hover {
      border-color: #3f3f46;
    }

    &.now-playing {
      border-color: #ef4444;
      box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.3);
    }
  }

  .pinned-card {
    background-color: #1c1a12;
    border-color: #422006;

    &:hover {
      border-color: #713f12;
    }

    &.now-playing {
      border-color: #ef4444;
    }
  }

  .older-card {
    opacity: 0.75;

    &:hover {
      opacity: 1;
    }
  }

  .thumbnail-clickable {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;

    &:hover .play-overlay {
      opacity: 1;
    }
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    opacity: 0;
    transition: opacity 160ms ease-out;
  }

  .video-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .video-title {
    font-size: 13px;
    font-weight: 600;
    color: #f4f4f5;
    margin: 0;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .video-channel {
    font-size: 11px;
    color: #a1a1aa;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }

  .btn-action {
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 5px;
    border: none;
    cursor: pointer;
    transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-out);

    &:active {
      transform: scale(0.97);
    }
  }

  .btn-play {
    background-color: #ff0000;
    color: white;

    &:hover {
      background-color: #dc2626;
    }
  }

  .btn-toggle {
    background-color: #27272a;
    color: #e4e4e7;

    &:hover {
      background-color: #3f3f46;
    }
  }

  .btn-remove {
    background-color: transparent;
    color: #71717a;

    &:hover {
      color: #ef4444;
      background-color: #27272a;
    }
  }
</style>
