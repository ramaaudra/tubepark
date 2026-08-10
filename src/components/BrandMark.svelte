<script lang="ts">
	import { brandMarkSvg } from "../shared/brand-mark";

	interface Props {
		size?: number;
	}

	let { size = 22 }: Props = $props();
</script>

{@html brandMarkSvg(size)}
