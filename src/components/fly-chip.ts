import { flyChipPath } from "../shared/motion";

interface FlyChipOptions {
	reduced: boolean;
	/** Batch label for Park All, e.g. "×8". Omit for a single park. */
	label?: string;
}

/**
 * The signature park moment: a mini P-badge chip flies in a shallow arc
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
	// Mini P via SVG so the chip matches the badge geometry.
	if (!label) {
		const svgNS = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(svgNS, "svg");
		svg.setAttribute("viewBox", "0 0 256 256");
		svg.setAttribute("width", "20");
		svg.setAttribute("height", "20");
		const rect = document.createElementNS(svgNS, "rect");
		rect.setAttribute("x", "16");
		rect.setAttribute("y", "16");
		rect.setAttribute("width", "224");
		rect.setAttribute("height", "224");
		rect.setAttribute("rx", "56");
		rect.setAttribute("fill", "var(--tp-accent)");
		const path = document.createElementNS(svgNS, "path");
		path.setAttribute("d", "M92 192V64h52a48 48 0 0 1 0 96H92");
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", "var(--tp-accent-contrast)");
		path.setAttribute("stroke-width", "30");
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		svg.append(rect, path);
		chip.appendChild(svg);
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
