export interface SpringConfig {
	type: "spring";
	stiffness: number;
	damping: number;
}

export interface TweenConfig {
	type: "tween";
	duration: number;
}

export type MotionConfig = SpringConfig | TweenConfig;

export interface ResolvedMotion {
	snappy: MotionConfig;
	gentle: MotionConfig;
}

const SNAPPY: SpringConfig = { type: "spring", stiffness: 400, damping: 28 };
const GENTLE: SpringConfig = { type: "spring", stiffness: 170, damping: 22 };
const REDUCED_FADE: TweenConfig = { type: "tween", duration: 150 };

export function resolveMotion(reduced: boolean): ResolvedMotion {
	if (reduced) {
		return { snappy: REDUCED_FADE, gentle: REDUCED_FADE };
	}
	return { snappy: SNAPPY, gentle: GENTLE };
}

export interface StaggerOptions {
	base?: number;
	cap?: number;
	reduced?: boolean;
}

export function staggerDelay(
	index: number,
	{ base = 40, cap = 5, reduced = false }: StaggerOptions = {},
): number {
	if (reduced) return 0;
	return Math.min(index, cap) * base;
}

export interface Point {
	x: number;
	y: number;
}

export interface FlyChipPath {
	dx: number;
	dy: number;
	arc: number;
}

export function flyChipPath(from: Point, to: Point): FlyChipPath {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const distance = Math.hypot(dx, dy);
	const arc =
		distance === 0 ? 0 : Math.min(64, Math.max(24, distance * 0.25));
	return { dx, dy, arc };
}
