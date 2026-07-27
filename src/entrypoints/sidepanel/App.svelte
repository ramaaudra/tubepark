<script lang="ts">
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { getQueueState, togglePinned, requestRemoval, cancelRemoval, getUiState, saveUiState, mutateQueue, deriveCollections, type QueueState } from '../../shared/storage';
  import { groupAndSortVideos, formatAgeBadge } from '../../shared/grouping';
  import { matchesSearch, matchesDuration, formatDuration, type DurationFilter } from '../../shared/filters';
  import { extractYouTubeVideoId } from '../../shared/capture-predicates';
  import { tabOps, type NowPlayingTab } from '../../shared/tab-operations';
  import { MSG } from '../../shared/messages';
  import Equalizer from '../../components/Equalizer.svelte';
  import { parkIn, parkOut } from '../../components/transitions';
  import Thumbnail from '../../components/Thumbnail.svelte';
  import Icon from '../../components/Icon.svelte';
  import ParkBadge from '../../components/ParkBadge.svelte';
  import ParkMeter from '../../components/ParkMeter.svelte';
  import type { ParkedVideo, CapacityState, GroupingPreference } from '../../shared/types';

  let queue = $state<ParkedVideo[]>([]);
  let capacity = $state<CapacityState>({ status: 'safe', count: 0, max: 200, percentage: 0 });
  let nowPlaying = $state<NowPlayingTab | null>(null);
  let query = $state('');
  let duration = $state<DurationFilter>('all');
  let activeCollection = $state<string | null>(null);
  let grouping = $state<GroupingPreference>('time');
  let selecting = $state(false);
  let selected = $state<string[]>([]);
  let pendingCount = $state(0);
  let draggedId = $state<string | null>(null);
  let reduced = $state(false);

  function applyState(state: QueueState) { queue = state.queue; capacity = state.capacity; }
  async function loadData() { applyState(await getQueueState()); nowPlaying = await tabOps.getNowPlayingTab(); }
  async function persistUi() { await saveUiState({ activeCollection, grouping }); }

  onMount(() => {
    query = '';
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void getUiState().then((ui) => { activeCollection = ui.activeCollection; grouping = ui.grouping; });
    void loadData();
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
    chrome.storage?.onChanged.addListener(storageListener);
    chrome.tabs?.onActivated.addListener(activatedListener);
    chrome.tabs?.onUpdated.addListener(updatedListener);
    chrome.runtime?.onMessage.addListener(messageListener);
    return () => {
      chrome.storage?.onChanged.removeListener(storageListener);
      chrome.tabs?.onActivated.removeListener(activatedListener);
      chrome.tabs?.onUpdated.removeListener(updatedListener);
      chrome.runtime?.onMessage.removeListener(messageListener);
    };
  });

  async function chooseCollection(value: string) {
    const previous = activeCollection;
    activeCollection = value || null;
    try { await persistUi(); } catch { activeCollection = previous; }
  }
  async function chooseGrouping(value: GroupingPreference) {
    const previous = grouping;
    grouping = value;
    try { await persistUi(); } catch { grouping = previous; }
  }
  async function remove(video: ParkedVideo) { applyState(await requestRemoval([video])); pendingCount = 1; }
  async function removeGroup(videos: ParkedVideo[]) { applyState(await requestRemoval(videos)); pendingCount = videos.length; }
  async function undo() { applyState(await cancelRemoval()); pendingCount = 0; }
  async function assignCollection() {
    const name = prompt('Nama collection (kosong untuk hapus):') ?? '';
    applyState(await mutateQueue('assignCollection', { ids: selected, collection: name.trim() }));
    selected = []; selecting = false;
  }
  async function renameCollection() {
    if (!activeCollection) return;
    const name = prompt('Ubah nama collection:', activeCollection);
    if (name === null) return;
    const previous = activeCollection;
    const next = name.trim() || null;
    try {
      await saveUiState({ activeCollection: next, grouping });
      applyState(await mutateQueue('renameCollection', { from: previous, to: name.trim() }));
      activeCollection = next;
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
  const scoped = $derived(queue.filter((v) => !activeCollection || v.collection === activeCollection));
  const filtered = $derived(scoped.filter((v) => matchesSearch(v, query)).filter((v) => matchesDuration(v, duration)));
  const grouped = $derived(groupAndSortVideos(filtered, { kind: grouping }));
</script>

<main>
  <header><div class="brand"><ParkBadge size={30}/><h1>TubePark</h1></div><ParkMeter count={capacity.count} max={capacity.max} status={capacity.status}/></header>
  <section class="controls">
    <input aria-label="Cari video" placeholder="Cari judul atau channel…" bind:value={query}/>
    <div class="row">
      <select aria-label="Collection" value={activeCollection ?? ''} onchange={(e) => chooseCollection(e.currentTarget.value)}><option value="">Semua ({queue.length})</option>{#each collections.filter((item) => item.name) as item}<option value={item.name ?? ''}>{item.name} ({item.count})</option>{/each}</select>
      {#if activeCollection}<button onclick={renameCollection}>Ubah nama</button><button onclick={() => chooseCollection('')}>×</button>{/if}
      <button onclick={() => selecting = !selecting}>{selecting ? 'Batal' : 'Pilih'}</button>
    </div>
    <div class="row"><select aria-label="Durasi" bind:value={duration}><option value="all">Semua durasi</option><option value="short">Pendek</option><option value="medium">Sedang</option><option value="long">Panjang</option></select><div class="seg"><button class:active={grouping === 'time'} onclick={() => chooseGrouping('time')}>Waktu</button><button class:active={grouping === 'channel'} onclick={() => chooseGrouping('channel')}>Channel</button></div></div>
    {#if selecting}<button class="assign" disabled={selected.length === 0} onclick={assignCollection}>Masukkan ke Collection ({selected.length})</button>{/if}
  </section>
  <div class="content">
    {#if filtered.length === 0}<div class="empty"><ParkBadge size={44}/><h3>Tidak ada video</h3><p>{query ? 'Coba pencarian lain.' : 'Park video dari YouTube untuk memulai.'}</p></div>{/if}
    {#if capacity.status === 'warning' || capacity.status === 'full'}
      <div class="banner" class:banner-full={capacity.status === 'full'}><Icon name="warning" size={16}/>{capacity.status === 'full' ? `Queue penuh (${capacity.count}/${capacity.max})!` : `Queue hampir penuh (${capacity.count}/${capacity.max})`}</div>
    {/if}
    {#each grouped as group}
      <section class:unknown={group.kind === 'unknown'}><h2>{group.label} <span>{group.items.length}</span>{#if group.kind === 'older'}<button class="bulk-btn" onclick={() => removeGroup(group.items)}>Hapus Semua</button>{/if}</h2>
        {#each group.items as video (video.id)}
          <article class:pinned={video.pinned} class:playing={nowPlaying?.videoId === video.id} ondragover={(e) => { if (video.pinned) e.preventDefault(); }} ondrop={() => { if (video.pinned) void dropOn(video.id); }} in:parkIn={{ reduced }} out:parkOut={{ reduced }} animate:flip={{ duration: reduced ? 150 : 320 }}>
            {#if selecting}<input type="checkbox" checked={selected.includes(video.id)} onchange={(e) => selected = e.currentTarget.checked ? [...selected, video.id] : selected.filter((id) => id !== video.id)}/>{/if}
            {#if video.pinned}<button class="grip" draggable="true" aria-label="Seret untuk mengurutkan {video.title}" title="Seret untuk urutkan" ondragstart={() => draggedId = video.id}><Icon name="grip" size={16}/></button>{/if}
            <button class="thumb" onclick={() => tabOps.openVideo(video.id, video.resumeAt)}><Thumbnail videoId={video.id} channel={video.channel}/></button>
            <div class="body"><strong>{video.title}</strong><small>{#if nowPlaying?.videoId === video.id}<Equalizer />{/if}{video.channel} · {formatAgeBadge(video)}{#if video.durationSec !== undefined} · {formatDuration(video.durationSec)}{/if}</small><div class="actions"><button onclick={() => tabOps.openVideo(video.id, video.resumeAt)}><Icon name="play" size={13}/> Putar</button><button onclick={async () => applyState(await togglePinned(video.id))}><Icon name={video.pinned ? 'pinFill' : 'pin'} size={13}/>{video.pinned ? 'Unpin' : 'Pin'}</button><button onclick={() => remove(video)}>×</button></div></div>
          </article>
        {/each}
      </section>
    {/each}
  </div>
  {#if pendingCount}<div class="toast" transition:fly={{ y: reduced ? 0 : 24, duration: reduced ? 150 : 300 }}><span>{pendingCount > 1 ? `${pendingCount} video dihapus` : 'Video dihapus'}</span><button onclick={undo}>Undo</button></div>{/if}
</main>

<style>
  main{height:100vh;background:var(--tp-bg);color:var(--tp-text);font-family:var(--tp-font);display:flex;flex-direction:column} header{padding:12px 16px;background:var(--tp-surface);border-bottom:1px solid var(--tp-border);display:flex;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:9px}.brand h1{font-size:16px;margin:0}.controls{padding:12px 16px;border-bottom:1px solid var(--tp-border);display:grid;gap:8px}.controls input,.controls select,.controls button{font:inherit}.controls>input{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--tp-border);border-radius:8px;background:var(--tp-surface);color:var(--tp-text)}.row{display:flex;gap:6px}.row select{flex:1}.row button,.assign,.actions button{border:1px solid var(--tp-border);background:var(--tp-surface);color:var(--tp-text-2);border-radius:6px;padding:5px 8px;cursor:pointer}.seg{display:flex}.seg button.active{background:var(--tp-accent);color:var(--tp-accent-contrast)}.content{overflow:auto;padding:16px;display:grid;gap:18px}h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--tp-text-2)}h2 span{background:var(--tp-surface-2);border-radius:10px;padding:1px 6px}.unknown{opacity:.7}article{display:flex;align-items:flex-start;gap:9px;padding:9px;margin-top:8px;background:var(--tp-surface);border:1px solid var(--tp-border);border-radius:10px}article.pinned,article.playing{border-color:var(--tp-accent)}.grip{cursor:grab;color:var(--tp-text-3);border:0;background:none;padding:4px}.banner{background:var(--tp-warn-bg);border:1px solid var(--tp-warn-border);color:var(--tp-warn-text);padding:9px 12px;border-radius:8px;display:flex;gap:8px}.banner-full{background:var(--tp-danger-soft);border-color:var(--tp-danger);color:var(--tp-danger)}.bulk-btn{float:right;border:1px solid var(--tp-danger);background:transparent;color:var(--tp-danger);border-radius:8px;cursor:pointer}.thumb{padding:0;border:0;background:none}.body{min-width:0;flex:1;display:grid;gap:4px}.body strong{font-size:13px}.body small{font-size:11px;color:var(--tp-text-3)}.actions{display:flex;gap:5px}.actions button{display:flex;align-items:center;gap:3px}.empty{text-align:center;color:var(--tp-text-3);padding:38px}.toast{position:fixed;bottom:16px;left:16px;right:16px;padding:10px 14px;border-radius:8px;background:var(--tp-text);color:var(--tp-bg);display:flex;justify-content:space-between}.toast button{border:0;background:none;color:var(--tp-accent);font-weight:700}
</style>
