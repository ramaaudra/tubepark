<script lang="ts">
	import { icons, type IconName } from "../shared/icons";

	interface Props {
		name: IconName;
		size?: number;
	}

	let { name, size = 16 }: Props = $props();
</script>

<svg
	viewBox="0 0 256 256"
	width={size}
	height={size}
	fill="currentColor"
	aria-hidden="true"
	class="tp-icon"
>
	{#each icons[name] as p}
		<path d={p.d} opacity={p.secondary ? 0.2 : 1} />
	{/each}
</svg>

<style>
	.tp-icon {
		display: inline-block;
		vertical-align: middle;
		flex-shrink: 0;
	}
</style>
