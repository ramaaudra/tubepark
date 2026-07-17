<script lang="ts">
  interface Props {
    videoId: string;
    channel: string;
    altText?: string;
  }

  let { videoId, channel, altText = 'Thumbnail' }: Props = $props();

  let failed = $state(false);

  const thumbnailUrl = $derived(`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`);
  const initialLetter = $derived(
    channel ? channel.trim().charAt(0).toUpperCase() : 'Y'
  );

  function handleError() {
    failed = true;
  }
</script>

<div class="thumbnail-wrapper">
  {#if !failed}
    <img
      src={thumbnailUrl}
      alt={altText}
      onerror={handleError}
      class="thumbnail-img"
      loading="lazy"
    />
  {:else}
    <div class="placeholder" title={channel}>
      <div class="placeholder-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
      <span class="placeholder-initial">{initialLetter}</span>
    </div>
  {/if}
</div>

<style>
  .thumbnail-wrapper {
    width: 96px;
    height: 54px;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    overflow: hidden;
    background-color: #18181b;
    flex-shrink: 0;
    position: relative;
  }

  .thumbnail-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #27272a, #18181b);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #a1a1aa;
    gap: 2px;
  }

  .placeholder-icon {
    color: #ff4d4d;
    opacity: 0.8;
  }

  .placeholder-initial {
    font-size: 10px;
    font-weight: 700;
    color: #e4e4e7;
    text-transform: uppercase;
  }
</style>
