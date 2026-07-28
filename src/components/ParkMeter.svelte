<script lang="ts">
	import type { CapacityStatus } from "../shared/types";

	interface Props {
		count: number;
		max: number;
		status: CapacityStatus;
	}

	let { count, max, status }: Props = $props();

	// Fill via transform (GPU) — the "park meter" spring. Overshoot easing
	// gives the settle feel; reduced-motion collapses the duration via tokens.
	const fill = $derived(Math.min(1, max > 0 ? count / max : 0));
</script>

<div
	class="park-meter"
	title="{count} of {max} slots used"
	data-status={status}
>
	<div class="meter-track">
		<div class="meter-fill" style:transform={`scaleX(${fill})`}></div>
	</div>
	<span class="meter-count">{count}<span class="meter-max">/{max}</span></span>
</div>

<style>
	.park-meter {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.meter-track {
		width: 44px;
		height: 6px;
		border-radius: var(--tp-r-chip);
		background: var(--tp-surface-2);
		border: 1px solid var(--tp-border);
		overflow: hidden;
	}

	.meter-fill {
		width: 100%;
		height: 100%;
		border-radius: inherit;
		background: var(--tp-accent);
		transform-origin: left;
		transition: transform var(--tp-dur-spring) var(--tp-ease-snappy);
	}

	.park-meter[data-status="warning"] .meter-fill {
		background: var(--tp-warn-text);
	}
	.park-meter[data-status="full"] .meter-fill {
		background: var(--tp-danger);
	}

	.meter-count {
		font-size: 11px;
		font-weight: 600;
		color: var(--tp-text-2);
		font-variant-numeric: tabular-nums;
	}

	.meter-max {
		color: var(--tp-text-3);
		font-weight: 500;
	}
</style>
