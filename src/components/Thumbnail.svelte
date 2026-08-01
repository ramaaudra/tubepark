<script lang="ts">
  import Icon from './Icon.svelte';

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
        <Icon name="play" size={20} />
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
    background-color: var(--tp-surface-2);
    flex-shrink: 0;
    position: relative;
    outline: 1px solid oklch(0 0 0 / 0.1);
    outline-offset: -1px;
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
    background: linear-gradient(135deg, var(--tp-surface-2), var(--tp-surface));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--tp-text-3);
    gap: 2px;
  }

  .placeholder-icon {
    color: var(--tp-accent);
    opacity: 0.85;
  }

  .placeholder-initial {
    font-size: 10px;
    font-weight: 700;
    color: var(--tp-text-2);
    text-transform: uppercase;
  }

  @media (prefers-color-scheme: dark) {
    .thumbnail-wrapper {
      outline-color: oklch(1 0 0 / 0.1);
    }
  }
</style>
