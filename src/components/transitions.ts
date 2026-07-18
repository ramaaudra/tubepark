import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

interface ParkInParams {
	delay?: number;
	duration?: number;
	reduced?: boolean;
}

/**
 * Signature enter: item slots in from above with a 1.5deg settle-tilt.
 * Reduced motion collapses it to a plain 150ms fade.
 */
export function parkIn(
	_node: Element,
	{ delay = 0, duration = 350, reduced = false }: ParkInParams = {},
): TransitionConfig {
	if (reduced) {
		return {
			delay,
			duration: 150,
			css: (t) => `opacity: ${t}`,
		};
	}
	return {
		delay,
		duration,
		easing: cubicOut,
		css: (t) => {
			const lift = (1 - t) * -10;
			const tilt = (1 - t) * -1.5;
			return `transform: translateY(${lift}px) rotate(${tilt}deg); opacity: ${t}`;
		},
	};
}

/**
 * Exit: item slides out to the right and fades — out of the parking slot.
 */
export function parkOut(
	_node: Element,
	{ delay = 0, duration = 250, reduced = false }: ParkInParams = {},
): TransitionConfig {
	if (reduced) {
		return {
			delay,
			duration: 150,
			css: (t) => `opacity: ${t}`,
		};
	}
	return {
		delay,
		duration,
		easing: cubicOut,
		css: (t) => {
			const slide = (1 - t) * 16;
			return `transform: translateX(${slide}px); opacity: ${t}`;
		},
	};
}
