<script lang="ts">
  import { onMount } from 'svelte';
  import { getQueue, getCapacity, removeVideo, toggleWatching } from '../../shared/storage';
  import { sweepExpiredVideos } from '../../shared/expiry';
  import { groupAndSortVideos, openOrUpdateYouTubeTab } from '../../shared/grouping';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import type { ParkedVideo, CapacityState } from '../../shared/types';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });

  async function loadData() {
    await sweepExpiredVideos();
    queue = await getQueue();
    capacity = await getCapacity();
  }

  onMount(() => {
    loadData();
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(loadData);
    }
  });

  async function handlePlay(video: ParkedVideo) {
    if (!video.watching) {
      queue = await toggleWatching(video.id);
    }
    await openOrUpdateYouTubeTab(video.id);
  }

  async function handleToggleWatching(id: string) {
    queue = await toggleWatching(id);
  }

  async function handleDoneOrRemove(id: string) {
    queue = await removeVideo(id);
    capacity = await getCapacity();
  }

  const grouped = $derived(groupAndSortVideos(queue));
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

  <div class="content-body">
    {#if queue.length === 0}
      <div class="empty-state">
        <div class="empty-icon">🎬</div>
        <h3>Scratchpad Kosong</h3>
        <p>Arahkan kursor ke video di YouTube lalu tekan tombol <strong>P</strong> atau klik kanan link video untuk memasukkannya ke queue.</p>
      </div>
    {:else}
      {#if grouped.watchingSection.length > 0}
        <section class="section">
          <div class="section-title watching-title">
            <span>🔴 Sedang Ditonton ({grouped.watchingSection.length})</span>
          </div>

          <div class="video-list">
            {#each grouped.watchingSection as video (video.id)}
              <div class="video-card watching-card">
                <div class="thumbnail-clickable" role="button" tabindex="0" onclick={() => handlePlay(video)} onkeydown={(e) => e.key === 'Enter' && handlePlay(video)}>
                  <Thumbnail videoId={video.id} channel={video.channel} />
                  <div class="play-overlay">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>

                <div class="video-info">
                  <div class="watching-badge">Watching</div>
                  <h4 class="video-title" title={video.title}>{video.title}</h4>
                  <span class="video-channel">{video.channel}</span>

                  <div class="card-actions">
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>
                      Play (Reuse Tab)
                    </button>
                    <button class="btn-action btn-done" onclick={() => handleDoneOrRemove(video.id)}>
                      ✓ Done
                    </button>
                    <button class="btn-action btn-toggle" onclick={() => handleToggleWatching(video.id)}>
                      Unmark
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.todaySection.length > 0}
        <section class="section">
          <div class="section-title">
            <span>📅 Terbaru ({grouped.todaySection.length})</span>
          </div>

          <div class="video-list">
            {#each grouped.todaySection as video (video.id)}
              <div class="video-card">
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
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>
                      Play
                    </button>
                    <button class="btn-action btn-toggle" onclick={() => handleToggleWatching(video.id)}>
                      Watch
                    </button>
                    <button class="btn-action btn-remove" onclick={() => handleDoneOrRemove(video.id)}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if grouped.olderSection.length > 0}
        <section class="section">
          <div class="section-title">
            <span>⏳ Lebih Dari 7 Hari ({grouped.olderSection.length})</span>
          </div>

          <div class="video-list">
            {#each grouped.olderSection as video (video.id)}
              <div class="video-card older-card">
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
                    <button class="btn-action btn-play" onclick={() => handlePlay(video)}>
                      Play
                    </button>
                    <button class="btn-action btn-remove" onclick={() => handleDoneOrRemove(video.id)}>
                      ✕ Remove
                    </button>
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
  }

  .watching-title {
    color: #ef4444;
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
    transition: transform 160ms var(--ease-out), border-color 160ms var(--ease-out);

    &:hover {
      border-color: #3f3f46;
    }
  }

  .watching-card {
    background-color: #1c1114;
    border-color: #7f1d1d;

    &:hover {
      border-color: #991b1b;
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

  .watching-badge {
    align-self: flex-start;
    background-color: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
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

  .btn-done {
    background-color: #15803d;
    color: white;

    &:hover {
      background-color: #166534;
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
