<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { getQueueState, togglePinned, requestRemoval, cancelRemoval, getUiState, saveUiState, mutateQueue, deriveCollections, type QueueState } from '../../shared/storage';
  import { groupAndSortVideos, formatAgeBadge } from '../../shared/grouping';
  import { matchesSearch, formatDuration } from '../../shared/filters';
  import { extractYouTubeVideoId } from '../../shared/capture-predicates';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import { MSG } from '../../shared/messages';
  import Equalizer from '../../components/Equalizer.svelte';
  import { parkIn, parkOut } from '../../components/transitions';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import Icon from '../../components/Icon.svelte';
  import BrandMark from '../../components/BrandMark.svelte';
  import ParkMeter from '../../components/ParkMeter.svelte';
  import type { ParkedVideo, CapacityState, GroupingPreference } from '../../shared/types';
  import { positionFloatingMenu } from '../../shared/ui-helpers';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let nowPlaying = $state<NowPlayingTab | null>(null);
  let query = $state('');
  let activeCollection = $state<string | null>(null);
  let grouping = $state<GroupingPreference>('time');
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let assigning = $state(false);
  let newCollectionName = $state('');
  let renaming = $state(false);
  let renameValue = $state('');
  let menuOpen = $state(false);
  let menuPos = $state<{ top: number; left: number } | null>(null);
  let pendingCount = $state(0);
  let draggedId = $state<string | null>(null);
  let reduced = $state(false);
  let loading = $state(true);
  let loadError = $state(false);
  let hydrated = $state(false);
  let animateItems = $state(false);
  let renameInput = $state<HTMLInputElement | null>(null);
  let tabsScrollEl = $state<HTMLElement | null>(null);
  let tabMenuEl = $state<HTMLElement | null>(null);
  let tabMenuButtonEl = $state<HTMLButtonElement | null>(null);
  let tabMenuItemEl = $state<HTMLButtonElement | null>(null);

  function applyState(state: QueueState) { queue = state.queue; capacity = state.capacity; }
  async function loadData() {
    try {
      applyState(await getQueueState());
      nowPlaying = await tabOps.getNowPlayingTab();
      loadError = false;
    } catch {
      loadError = true;
    }
  }
  async function persistUi() { await saveUiState({ activeCollection, grouping }); }

  function clearSelectionMode() {
    selecting = false;
    selected = [];
    assigning = false;
    newCollectionName = '';
  }

  function closeMenus() {
    menuOpen = false;
    menuPos = null;
    if (!renaming) return;
    renaming = false;
    renameValue = '';
  }

  function toggleTabMenu(event: MouseEvent) {
    event.stopPropagation();
    if (menuOpen) {
      menuOpen = false;
      menuPos = null;
      return;
    }
    const btn = event.currentTarget;
    if (!(btn instanceof HTMLElement)) return;
    const rect = btn.getBoundingClientRect();
    tabMenuButtonEl = btn instanceof HTMLButtonElement ? btn : null;
    menuOpen = true;
    // Anchor below the ⋯ control, then flip/clamp after the menu has mounted.
    menuPos = { top: rect.bottom + 4, left: rect.right };
    void tick().then(() => {
      if (!tabMenuEl || !menuPos) return;
      menuPos = positionFloatingMenu(
        { top: rect.top, right: rect.right, bottom: rect.bottom },
        { width: tabMenuEl.offsetWidth, height: tabMenuEl.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      tabMenuItemEl?.focus();
    });
  }

  function scrollActiveTabIntoView() {
    if (!tabsScrollEl || !activeCollection) return;
    const el = tabsScrollEl.querySelector<HTMLElement>(`[data-collection-tab=${JSON.stringify(activeCollection)}]`);
    el?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }

  onMount(() => {
    query = '';
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void (async () => {
      try {
        const ui = await getUiState();
        activeCollection = ui.activeCollection;
        grouping = ui.grouping;
        await loadData();
        await tick();
        scrollActiveTabIntoView();
      } catch {
        loadError = true;
      } finally {
        hydrated = true;
        loading = false;
        await tick();
        animateItems = true;
      }
    })();
    const storageListener = () => void loadData();
    const activatedListener = () => void loadData();
    const updatedListener = (_id: number, info: chrome.tabs.TabChangeInfo) => { if (info.url && extractYouTubeVideoId(info.url)) void loadData(); };
    const messageListener = (message: { type?: string; pendingIds?: unknown }) => {
      if (message.type === MSG.PENDING_REMOVAL_CHANGED) {
        pendingCount = Array.isArray(message.pendingIds) ? message.pendingIds.length : 0;
        void loadData();
      }
      return false;
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-tab-menu]') && !target.closest('[data-tab-menu-btn]')) {
        menuOpen = false;
        menuPos = null;
      }
    };
    const onScrollOrResize = () => {
      if (!menuOpen) return;
      menuOpen = false;
      menuPos = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !menuOpen) return;
      event.preventDefault();
      menuOpen = false;
      menuPos = null;
      tabMenuButtonEl?.focus();
    };
    chrome.storage?.onChanged.addListener(storageListener);
    chrome.tabs?.onActivated.addListener(activatedListener);
    chrome.tabs?.onUpdated.addListener(updatedListener);
    chrome.runtime?.onMessage.addListener(messageListener);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onScrollOrResize);
    // Capture scroll from tabs-scroll (and nested) so a clipped anchor can't leave a stranded menu.
    document.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      chrome.storage?.onChanged.removeListener(storageListener);
      chrome.tabs?.onActivated.removeListener(activatedListener);
      chrome.tabs?.onUpdated.removeListener(updatedListener);
      chrome.runtime?.onMessage.removeListener(messageListener);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onScrollOrResize);
      document.removeEventListener('scroll', onScrollOrResize, true);
    };
  });

  async function chooseCollection(value: string | null) {
    const next = value || null;
    clearSelectionMode();
    closeMenus();
    if (next === activeCollection) return;
    const previous = activeCollection;
    activeCollection = next;
    try {
      await persistUi();
      await tick();
      scrollActiveTabIntoView();
    } catch {
      activeCollection = previous;
    }
  }

  async function chooseGrouping(value: GroupingPreference) {
    const previous = grouping;
    grouping = value;
    try { await persistUi(); } catch { grouping = previous; }
  }

  async function remove(video: ParkedVideo) { applyState(await requestRemoval([video])); pendingCount = 1; }
  async function removeGroup(videos: ParkedVideo[]) { applyState(await requestRemoval(videos)); pendingCount = videos.length; }
  async function undo() { applyState(await cancelRemoval()); pendingCount = 0; }

  function toggleSelecting() {
    if (selecting) {
      clearSelectionMode();
      return;
    }
    selecting = true;
    assigning = false;
    menuOpen = false;
  }

  async function assignTo(collection = '') {
    if (selected.length === 0) return;
    applyState(await mutateQueue('assignCollection', { ids: selected, collection }));
    clearSelectionMode();
  }

  async function createAndAssign() {
    const name = newCollectionName.trim();
    if (!name) return;
    await assignTo(name);
  }

  async function startRename() {
    if (!activeCollection) return;
    menuOpen = false;
    menuPos = null;
    renaming = true;
    renameValue = activeCollection;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function cancelRename() {
    renaming = false;
    renameValue = '';
  }

  async function commitRename() {
    if (!activeCollection || !renaming) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === activeCollection) {
      cancelRename();
      return;
    }
    const previous = activeCollection;
    try {
      await saveUiState({ activeCollection: trimmed, grouping });
      applyState(await mutateQueue('renameCollection', { from: previous, to: trimmed }));
      activeCollection = trimmed;
      cancelRename();
      await tick();
      scrollActiveTabIntoView();
    } catch {
      activeCollection = previous;
      try { await persistUi(); } catch { /* storage remains unchanged or unavailable */ }
    }
  }

  async function dropOn(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const ids = grouped.flatMap((g) => g.kind === 'up-next' ? g.items.map((v) => v.id) : []);
    const from = ids.indexOf(draggedId); const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { draggedId = null; return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    applyState(await mutateQueue('reorderPinned', { ids })); draggedId = null;
  }

  const collections = $derived(deriveCollections(queue));
  const namedCollections = $derived(
    collections.filter((item): item is { name: string; count: number } => typeof item.name === 'string' && item.name.length > 0),
  );
  const scoped = $derived(queue.filter((v) => !activeCollection || v.collection === activeCollection));
  const filtered = $derived(scoped.filter((v) => matchesSearch(v, query)));
  const grouped = $derived(groupAndSortVideos(filtered, { kind: grouping }));
  const selectedHaveCollection = $derived(selected.some((id) => queue.find((video) => video.id === id)?.collection));

  // Ghost lens: only after first hydrate so empty pre-load queue cannot wipe saved tab.
  $effect(() => {
    if (!hydrated || !activeCollection) return;
    if (namedCollections.some((item) => item.name === activeCollection)) return;
    activeCollection = null;
    clearSelectionMode();
    closeMenus();
    void persistUi();
  });
</script>

<main>
  <header><div class="brand"><BrandMark size={30}/><h1>TubePark</h1></div><ParkMeter count={capacity.count} max={capacity.max} status={capacity.status}/></header>
  <section class="controls">
    <input type="search" aria-label="Search videos" placeholder="Search title or channel…" bind:value={query}/>

    <div class="toolbar-row">
      <div class="tabs-wrap" role="tablist" aria-label="Collections">
        <button
          type="button"
          role="tab"
          class="tab sticky-tab"
          class:active={!activeCollection}
          aria-selected={!activeCollection}
          onclick={() => void chooseCollection(null)}
        >
          All <span class="count">{queue.length}</span>
        </button>
        <div class="tabs-scroll" bind:this={tabsScrollEl}>
          {#each namedCollections as item (item.name)}
            <div
              class="tab-item"
              class:active={activeCollection === item.name}
              data-collection-tab={item.name}
            >
              {#if renaming && activeCollection === item.name}
                <input
                  class="rename-input"
                  aria-label="Rename collection"
                  bind:this={renameInput}
                  bind:value={renameValue}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                  }}
                  onblur={() => void commitRename()}
                />
              {:else}
                <button
                  type="button"
                  role="tab"
                  class="tab"
                  class:active={activeCollection === item.name}
                  aria-selected={activeCollection === item.name}
                  onclick={() => void chooseCollection(item.name)}
                >
                  {item.name} <span class="count">{item.count}</span>
                </button>
                {#if activeCollection === item.name}
                  <button
                    type="button"
                    class="tab-more"
                    data-tab-menu-btn
                    aria-label="Collection menu"
                    title="Collection menu"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-controls="collection-menu"
                    onclick={toggleTabMenu}
                  >⋯</button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="toolbar-end">
        <div class="seg" role="group" aria-label="Group by">
          <button type="button" class:active={grouping === 'time'} onclick={() => void chooseGrouping('time')}>Time</button>
          <button type="button" class:active={grouping === 'channel'} onclick={() => void chooseGrouping('channel')}>Channel</button>
        </div>
        <button type="button" class="pick-btn" onclick={toggleSelecting}>{selecting ? 'Cancel' : 'Select'}</button>
      </div>
    </div>

    {#if menuOpen && menuPos && activeCollection}
      <div
        class="tab-menu"
        data-tab-menu
        id="collection-menu"
        role="menu"
        bind:this={tabMenuEl}
        style:top="{menuPos.top}px"
        style:left="{menuPos.left}px"
        transition:scale={{ duration: reduced ? 120 : 160, start: reduced ? 1 : 0.94, easing: cubicOut }}
      >
        <button type="button" role="menuitem" bind:this={tabMenuItemEl} onclick={() => void startRename()}>Rename</button>
      </div>
    {/if}

    {#if selecting}
      <div class="assign-bar">
        <button
          type="button"
          class="assign"
          disabled={selected.length === 0}
          aria-expanded={assigning}
          aria-haspopup="menu"
          aria-controls="collection-picker"
          onclick={() => { assigning = !assigning; }}
        >
          Add to collection ({selected.length})
        </button>
        {#if assigning && selected.length > 0}
          <div class="picker" id="collection-picker" role="menu" aria-label="Select collection">
            {#each namedCollections as item (item.name)}
              <button type="button" role="menuitem" onclick={() => void assignTo(item.name)}>{item.name}</button>
            {/each}
            <form class="new-row" onsubmit={(e) => { e.preventDefault(); void createAndAssign(); }}>
              <input
                aria-label="New collection"
                placeholder="New collection…"
                bind:value={newCollectionName}
              />
              <button type="submit" disabled={!newCollectionName.trim()}>Create</button>
            </form>
            {#if selectedHaveCollection}
              <button type="button" class="clear-assign" onclick={() => void assignTo('')}>Remove from collection</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </section>
  <div class="content">
    {#if loading}
      <div class="empty loading-state" aria-busy="true"><BrandMark size={34}/><h3>Loading your queue…</h3></div>
    {:else if loadError}
      <div class="empty load-error" role="alert"><BrandMark size={34}/><h3>Could not load your queue</h3><button type="button" class="pick-btn" onclick={() => { loading = true; void loadData().finally(() => { loading = false; }); }}>Retry</button></div>
    {:else if filtered.length === 0}
      <div class="empty"><BrandMark size={44}/><h3>{query ? 'No results' : 'No videos parked yet'}</h3><p>{query ? 'Try a different search.' : 'Park a video on YouTube to get started.'}</p></div>
    {/if}
    {#if !loading && !loadError && (capacity.status === 'warning' || capacity.status === 'full')}
      <div class="banner" class:banner-full={capacity.status === 'full'}><Icon name="warning" size={16}/>{capacity.status === 'full' ? `Queue full (${capacity.count}/${capacity.max})` : `Queue almost full (${capacity.count}/${capacity.max})`}</div>
    {/if}
    {#if !loading && !loadError}
      {#each grouped as group}
      <section class:unknown={group.kind === 'unknown'}><h2>{group.label} <span>{group.items.length}</span>{#if group.kind === 'older'}<button type="button" class="bulk-btn" onclick={() => removeGroup(group.items)}>Remove all</button>{/if}</h2>
        {#each group.items as video (video.id)}
          {@const isSelected = selected.includes(video.id)}
          <article
            class:pinned={video.pinned}
            class:playing={nowPlaying?.videoId === video.id}
            class:selecting
            class:selected={selecting && isSelected}
            ondragover={(e) => { if (video.pinned) e.preventDefault(); }}
            ondrop={() => { if (video.pinned) void dropOn(video.id); }}
            in:parkIn={{ reduced, skip: !animateItems }}
            out:parkOut={{ reduced }}
            animate:flip={{ duration: reduced ? 0 : 250 }}
          >
            {#if selecting}
              <label class="check" class:on={isSelected}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  aria-label="Select {video.title}"
                  onchange={(e) => selected = e.currentTarget.checked ? [...selected, video.id] : selected.filter((id) => id !== video.id)}
                />
                <span class="check-mark" aria-hidden="true"></span>
              </label>
            {/if}
            {#if video.pinned}<button class="grip" draggable="true" aria-label="Reorder {video.title}" title="Drag to reorder" ondragstart={() => draggedId = video.id}><Icon name="grip" size={16}/></button>{/if}
            <button
              type="button"
              class="thumb"
              aria-label={selecting ? (isSelected ? `Deselect ${video.title}` : `Select ${video.title}`) : `Play ${video.title}`}
              onclick={() => selecting ? (selected = isSelected ? selected.filter((id) => id !== video.id) : [...selected, video.id]) : tabOps.openVideo(video.id, video.resumeAt)}
            ><Thumbnail videoId={video.id} channel={video.channel} altText={selecting ? `Select ${video.title}` : `Play ${video.title}`}/></button>
            <div class="body"><strong>{video.title}</strong><small>{#if nowPlaying?.videoId === video.id}<Equalizer />{/if}{video.channel} · {formatAgeBadge(video)}{#if video.durationSec !== undefined} · {formatDuration(video.durationSec)}{/if}</small><div class="actions"><button type="button" aria-label="Play {video.title}" title="Play" onclick={() => tabOps.openVideo(video.id, video.resumeAt)}><Icon name="play" size={14}/></button><button type="button" aria-label={video.pinned ? `Unpin ${video.title}` : `Pin ${video.title}`} title={video.pinned ? 'Unpin' : 'Pin'} onclick={async () => applyState(await togglePinned(video.id))}><Icon name={video.pinned ? 'pinFill' : 'pin'} size={14}/></button><button type="button" aria-label="Remove {video.title}" title="Remove" onclick={() => remove(video)}><Icon name="x" size={14}/></button></div></div>
          </article>
        {/each}
      </section>
      {/each}
    {/if}
  </div>
  {#if pendingCount}<div class="toast" transition:fly={{ y: reduced ? 0 : 24, duration: reduced ? 150 : 300, easing: cubicOut }}><span>{pendingCount > 1 ? `${pendingCount} videos removed` : 'Video removed'}</span><button type="button" onclick={undo}>Undo</button></div>{/if}
</main>

<style>
  main{height:100vh;background:var(--tp-bg);color:var(--tp-text);font-family:var(--tp-font);display:flex;flex-direction:column}
  header{padding:12px 16px;background:var(--tp-surface);border-bottom:1px solid var(--tp-border);display:flex;align-items:center;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:9px}
  .brand h1{font-size:16px;margin:0}
  .controls{padding:12px 16px;border-bottom:1px solid var(--tp-border);display:grid;gap:8px;overflow:visible}
  .controls input,.controls button{font:inherit}
  .controls>input{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;background:var(--tp-surface);color:var(--tp-text)}

  .toolbar-row{display:flex;align-items:center;gap:8px;min-width:0}
  .tabs-wrap{display:flex;gap:6px;min-width:0;flex:1;align-items:center}
  .tabs-scroll{display:flex;gap:6px;min-width:0;flex:1;overflow-x:auto;overflow-y:visible;scrollbar-width:thin;padding-bottom:1px}
  .tab-item{position:relative;display:flex;align-items:center;flex-shrink:0;gap:0;z-index:0}
  .tab-item.active{z-index:2}
  .tab,.pick-btn,.assign,.actions button,.picker button,.new-row button,.tab-more,.tab-menu button{
    border:1px solid var(--tp-border);background:var(--tp-surface);color:var(--tp-text-2);border-radius:6px;padding:5px 8px;cursor:pointer;min-height:40px
  }
  .tab{white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}
  .sticky-tab{flex-shrink:0}
  .tab.active,.tab-item.active .tab{background:var(--tp-accent);color:var(--tp-accent-contrast);border-color:var(--tp-accent)}
  .tab .count{opacity:.72;font-variant-numeric:tabular-nums}
  .tab-item.active .tab{border-top-right-radius:0;border-bottom-right-radius:0;border-right:0}
  .tab-more{border-top-left-radius:0;border-bottom-left-radius:0;padding:5px 7px;line-height:1;font-weight:700;letter-spacing:.04em;position:relative;z-index:1}
  .tab-item.active .tab-more{background:var(--tp-accent);color:var(--tp-accent-contrast);border-color:var(--tp-accent)}
  .tab-menu{position:fixed;z-index:40;min-width:120px;padding:4px;border:1px solid var(--tp-border);border-radius:8px;background:var(--tp-surface);box-shadow:var(--tp-shadow-lift);display:grid;transform-origin:top right}
  .tab-menu button{border:0;text-align:left;border-radius:6px}
  .tab-menu button:hover{background:var(--tp-surface-2)}
  .rename-input{box-sizing:border-box;width:140px;min-height:40px;padding:5px 8px;border:1px solid var(--tp-accent);border-radius:6px;background:var(--tp-surface);color:var(--tp-text)}

  .toolbar-end{display:flex;align-items:center;gap:6px;flex-shrink:0}
  .seg{display:flex}
  .seg button{border:1px solid var(--tp-border);background:var(--tp-surface);color:var(--tp-text-2);min-height:40px;padding:5px 10px;cursor:pointer;white-space:nowrap}
  .seg button:first-child{border-radius:6px 0 0 6px}
  .seg button:last-child{border-radius:0 6px 6px 0;border-left-width:0}
  .seg button.active{background:var(--tp-accent);color:var(--tp-accent-contrast);border-color:var(--tp-accent)}
  .seg button.active + button{border-left-color:var(--tp-accent)}
  .pick-btn{white-space:nowrap}

  .assign-bar{display:grid;gap:6px}
  .assign{width:100%}
  .assign:disabled{opacity:.5;cursor:not-allowed}
  .picker{display:grid;gap:4px;padding:8px;border:1px solid var(--tp-border);border-radius:8px;background:var(--tp-surface)}
  .picker > button{text-align:left}
  .new-row{display:flex;gap:6px}
  .new-row input{flex:1;min-width:0;min-height:40px;padding:6px 8px;border:1px solid var(--tp-border);border-radius:6px;background:var(--tp-bg);color:var(--tp-text)}
  .clear-assign{color:var(--tp-danger);border-color:var(--tp-danger)}

  .content{min-height:0;overflow:auto;padding:16px;display:grid;gap:18px}
  h2{margin:0 0 8px;font-size:11px;line-height:1.2;text-transform:uppercase;letter-spacing:.06em;color:var(--tp-text-2);text-wrap:balance}
  h2 span{background:var(--tp-surface-2);border-radius:10px;padding:1px 6px;font-variant-numeric:tabular-nums}
  .unknown{opacity:.7}
  article{display:flex;align-items:flex-start;gap:9px;padding:8px;margin-top:8px;background:var(--tp-surface);border:1px solid var(--tp-border);border-radius:var(--tp-r-card);transition:border-color .15s ease, background-color .15s ease, transform .15s var(--tp-ease-gentle)}
  article.pinned,article.playing{border-color:var(--tp-accent)}
  article.selected{border-color:var(--tp-accent);background:color-mix(in srgb, var(--tp-accent) 10%, var(--tp-surface))}
  @media (hover: hover) and (pointer: fine) {
    article:hover { transform: translateY(-2px); }
  }
  .check{position:relative;flex-shrink:0;width:40px;height:40px;margin-top:0;border:0;border-radius:8px;background:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .12s ease, transform var(--tp-dur-press) var(--tp-ease-snappy)}
  .check::before{content:"";position:absolute;width:18px;height:18px;border:1px solid var(--tp-border);border-radius:5px;background:var(--tp-bg);transition:background-color .12s ease, border-color .12s ease, box-shadow .12s ease}
  .check:hover::before{border-color:var(--tp-text-3)}
  .check.on::before{background:var(--tp-accent);border-color:var(--tp-accent);box-shadow:0 0 0 1px color-mix(in srgb, var(--tp-accent) 35%, transparent)}
  .check input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
  .check:focus-within{outline:2px solid var(--tp-accent);outline-offset:2px}
  .check-mark{position:relative;z-index:1;width:10px;height:6px;border-left:2px solid transparent;border-bottom:2px solid transparent;transform:translateY(-1px) rotate(-45deg);pointer-events:none}
  .check.on .check-mark{border-color:var(--tp-accent-contrast)}
  .grip{display:inline-flex;align-items:center;justify-content:center;width:40px;min-height:40px;cursor:grab;color:var(--tp-text-3);border:0;background:none;padding:0;border-radius:8px;transition:color var(--tp-dur-micro) ease, background-color var(--tp-dur-micro) ease, transform var(--tp-dur-press) var(--tp-ease-snappy)}
  .grip:hover{background:var(--tp-surface-2);color:var(--tp-text-2)}
  .grip:active{transform:scale(0.96)}
  .banner{background:var(--tp-warn-bg);border:1px solid var(--tp-warn-border);color:var(--tp-warn-text);padding:9px 12px;border-radius:8px;display:flex;gap:8px}
  .banner-full{background:var(--tp-danger-soft);border-color:var(--tp-danger);color:var(--tp-danger)}
  .bulk-btn{float:right;min-height:40px;padding:5px 8px;border:1px solid var(--tp-danger);background:transparent;color:var(--tp-danger);border-radius:8px;cursor:pointer}
  .thumb{padding:0;border:0;background:none;cursor:pointer;border-radius:6px;line-height:0}
  .body{min-width:0;flex:1;display:grid;gap:4px}
  .body strong{font-size:13px}
  .body small{font-size:11px;color:var(--tp-text-2);text-wrap:pretty}
  .actions{display:flex;gap:4px}
  .actions button{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;transition:background-color var(--tp-dur-micro) ease, transform var(--tp-dur-press) var(--tp-ease-snappy)}
  .actions button:active{transform:scale(0.96)}
  .empty{text-align:center;color:var(--tp-text-3);padding:38px}
  .empty h3,.empty p{margin:0}
  .empty h3{line-height:1.25;text-wrap:balance}
  .empty p{margin-top:6px;text-wrap:pretty}
  .load-error{color:var(--tp-danger)}
  .load-error .pick-btn{color:var(--tp-accent)}
  .toast{position:fixed;bottom:16px;left:16px;right:16px;padding:10px 14px;border-radius:8px;background:var(--tp-text);color:var(--tp-bg);display:flex;justify-content:space-between;box-shadow:var(--tp-shadow-lift)}
  .toast button{min-height:40px;border:0;background:none;color:var(--tp-accent);font-weight:700;cursor:pointer}
  button:focus-visible,input:focus-visible{outline:2px solid var(--tp-accent);outline-offset:2px}
</style>
