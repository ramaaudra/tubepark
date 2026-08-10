import { flyChipPath } from "../shared/motion";
import { brandMarkSvg } from "../shared/brand-mark";

interface FlyChipOptions {
	reduced: boolean;
	/** Batch label for Park All, e.g. "×8". Omit for a single park. */
	label?: string;
}

/**
 * The signature park moment: a mini Park Loop mark flies in a shallow arc
 * from the action button to where the item lands in the queue.
 * DOM/WAAPI side-effect — pure math lives (tested) in shared/motion.ts.
 * No-op under reduced motion: the list item's fade-in carries the feedback.
 */
export function flyChip(
	from: Element,
	to: Element,
	{ reduced, label }: FlyChipOptions,
): void {
	if (reduced) return;

	const fromRect = from.getBoundingClientRect();
	const toRect = to.getBoundingClientRect();

	const origin = {
		x: fromRect.left + fromRect.width / 2 - 10,
		y: fromRect.top + fromRect.height / 2 - 10,
	};
	const target = {
		x: toRect.left + 18,
		y: toRect.top + 10,
	};
	const { dx, dy, arc } = flyChipPath(origin, target);

	const chip = document.createElement("div");
	chip.className = "tp-fly-chip";
	chip.textContent = label ?? "";
	chip.style.cssText = `
		position: fixed;
		left: ${origin.x}px;
		top: ${origin.y}px;
		width: 20px;
		height: 20px;
		border-radius: 5px;
		background: var(--tp-accent);
		color: var(--tp-accent-contrast);
		font: 700 11px/20px var(--tp-font);
		text-align: center;
		pointer-events: none;
		z-index: 9999;
	`;
	// Reuse the canonical brand SVG so the motion chip cannot drift from BrandMark.
	if (!label) {
		chip.innerHTML = brandMarkSvg(20);
		chip.style.background = "transparent";
	}
	document.body.appendChild(chip);

	const animation = chip.animate(
		[
			{ transform: "translate(0, 0) scale(1)", opacity: 1, offset: 0 },
			{
				transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(0.95)`,
				opacity: 1,
				offset: 0.55,
			},
			{
				transform: `translate(${dx}px, ${dy}px) scale(0.4)`,
				opacity: 0.6,
				offset: 1,
			},
		],
		{
			duration: 400,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
		},
	);
	animation.onfinish = () => chip.remove();
}
