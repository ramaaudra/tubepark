<!-- Now Playing indicator: the only looping animation in the UI.
     Communicates "audio is playing from this item". Pure CSS, transform-only.
     Static under prefers-reduced-motion. -->
<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>

<style>
	.eq {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
		height: 12px;
	}

	.eq i {
		width: 3px;
		height: 100%;
		background: var(--tp-accent);
		border-radius: 1.5px;
		transform-origin: bottom;
		animation: eq-bounce 0.9s ease-in-out infinite;
	}

	.eq i:nth-child(1) {
		animation-delay: 0s;
	}
	.eq i:nth-child(2) {
		animation-delay: 0.12s;
	}
	.eq i:nth-child(3) {
		animation-delay: 0.24s;
	}

	@keyframes eq-bounce {
		0%,
		100% {
			transform: scaleY(0.35);
		}
		50% {
			transform: scaleY(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.eq i {
			animation: none;
			transform: scaleY(0.6);
		}
	}
</style>
