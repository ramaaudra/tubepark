<script lang="ts">
	interface Props {
		size?: number;
	}

	let { size = 22 }: Props = $props();
</script>

<!-- Custom P-badge: rambu parkir. Rounded green sign + chunky stroke P. -->
<svg
	viewBox="0 0 256 256"
	width={size}
	height={size}
	aria-hidden="true"
	class="park-badge"
>
	<rect
		x="16"
		y="16"
		width="224"
		height="224"
		rx="56"
		fill="var(--tp-accent)"
	/>
	<path
		d="M92 192V64h52a48 48 0 0 1 0 96H92"
		fill="none"
		stroke="var(--tp-accent-contrast)"
		stroke-width="30"
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>

<style>
	.park-badge {
		display: inline-block;
		vertical-align: middle;
		flex-shrink: 0;
		border-radius: 22%;
	}
</style>
