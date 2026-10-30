// The tabs sit on a ring. Positions are in tabs and keep counting past the
// ends: with 5 tabs, 0 and 5 both centre the first tab and -1 the last; 1.5
// is halfway between the second and the third. Velocities are in tabs per
// second.

/** How quickly a released spin slows down, in tabs per second squared. */
const FRICTION = 70;
/** Releasing faster than this, in tabs per second, always moves at least one tab. */
const FLICK_VELOCITY = 1.5;
/** Bounds on how long a spin takes to come to rest, in milliseconds. */
const MIN_SPIN = 250;
const MAX_SPIN = 1600;

/**
 * The position to settle on when a drag that began at `from` is released at
 * `position` with `velocity`. A released carousel spins on and slows under
 * steady friction, like a revolver barrel, so the distance grows with the
 * square of the speed: a flick moves on even when the drag was short, and a
 * hard one turns through several tabs.
 */
export function snapIndex(from: number, position: number, velocity: number) {
  'worklet';
  const coast = (Math.sign(velocity) * velocity * velocity) / (2 * FRICTION);
  const target = Math.round(position + coast);
  const direction = Math.sign(velocity);
  if (target === from && Math.abs(velocity) > FLICK_VELOCITY && Math.sign(position - from) === direction) {
    return from + direction;
  }
  return target;
}

/**
 * How long, in milliseconds, an ease-out cubic spin over `distance` tabs takes
 * so that it starts at the release's `velocity`.
 */
export function spinDuration(distance: number, velocity: number) {
  'worklet';
  // An ease-out cubic starts at three times its average speed.
  const seconds = (3 * Math.abs(distance)) / Math.max(Math.abs(velocity), 0.001);
  return Math.min(MAX_SPIN, Math.max(MIN_SPIN, seconds * 1000));
}

/** The tab at `position` on a ring of `count`. */
export function wrap(position: number, count: number) {
  'worklet';
  return ((position % count) + count) % count;
}

/**
 * How far tab `to` is from `from` the shorter way round a ring of `count`,
 * negative to the left.
 */
export function ringDistance(from: number, to: number, count: number) {
  'worklet';
  return wrap(to - from + count / 2, count) - count / 2;
}

/**
 * Whether a carousel of `count` tabs showing `visible` at once goes round in
 * a ring. With fewer tabs than slots, the one going round the back would show,
 * so it stops at its ends instead.
 */
export function isRing(count: number, visible: number) {
  'worklet';
  return count >= visible;
}

/** How far tab `index` is from the centre at `position`, negative to the left. */
export function itemDistance(position: number, index: number, count: number, ring: boolean) {
  'worklet';
  return ring ? ringDistance(position, index, count) : index - position;
}

/** The tab at `position`: round the ring, or the nearest end. */
export function tabAt(position: number, count: number, ring: boolean) {
  'worklet';
  const i = Math.round(position);
  return ring ? wrap(i, count) : Math.max(0, Math.min(count - 1, i));
}

/** The furthest a carousel with ends stretches past them, in tabs. */
const MAX_OVERSCROLL = 0.5;

/** Drags past the first or last tab of a carousel with ends meet growing resistance. */
export function rubberBand(position: number, count: number) {
  'worklet';
  const last = count - 1;
  const resist = (overshoot: number) => MAX_OVERSCROLL * (1 - 1 / (1 + overshoot / MAX_OVERSCROLL / 2));
  if (position < 0) return -resist(-position);
  if (position > last) return last + resist(position - last);
  return position;
}

/** How far from a tab the carousel may be, in tabs, and still count as at rest. */
const AT_REST = 0.05;

/** Whether the carousel at `position` is still on its way to `target`. */
export function moving(position: number, target: number) {
  'worklet';
  return Math.abs(position - target) > AT_REST;
}

/**
 * How many tabs to turn for a tap `x` points from the left of a bar `width`
 * wide showing `visible` tabs: 0 for the centred one, negative to the left.
 * Null while the carousel is still moving from `position` to `target`, so a
 * tap meant to stop a spin doesn't pick whatever was passing.
 */
export function tapTurn(x: number, width: number, visible: number, position: number, target: number) {
  'worklet';
  if (moving(position, target)) return null;
  const half = Math.floor(visible / 2);
  const slot = width / visible;
  return Math.max(-half, Math.min(half, Math.round((x - width / 2) / slot))) || 0;
}

/** Room left and right of the centred label inside the highlight, in points. */
export const HIGHLIGHT_PADDING = 8;

/**
 * Width of the highlight behind the centre at `position`: wide enough for the
 * label there, blending between two labels' widths mid-swipe, and never
 * narrower than `min`. `labels` holds each tab's measured label width; tabs
 * not measured yet count as 0.
 */
export function highlightWidth(position: number, labels: number[], min: number) {
  'worklet';
  const count = labels.length;
  if (count === 0) return min;
  const before = Math.floor(position);
  const along = position - before;
  const a = labels[wrap(before, count)] ?? 0;
  const b = labels[wrap(before + 1, count)] ?? 0;
  return Math.max(min, a + (b - a) * along + 2 * HIGHLIGHT_PADDING);
}

/** Linear interpolation of `x` over `stops`, clamped at both ends. */
function interpolate(x: number, stops: [number, number][]) {
  'worklet';
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, y1] = stops[i];
    if (x <= x1) {
      const [x0, y0] = stops[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * How a tab looks `distance` tabs from the centre (negative to the left), on
 * a carousel showing `half` tabs to each side: the centred tab is full size,
 * and the others shrink and turn away like faces of a wheel. A tab fades out
 * past the carousel's ends, as it goes round to the other side.
 */
export function carouselTransform(distance: number, half = 2) {
  'worklet';
  const away = Math.abs(distance);
  return {
    scale: interpolate(away, [
      [0, 1],
      [1, 0.86],
      [2, 0.78],
    ]),
    opacity: interpolate(away, [
      [0, 1],
      [half, 1 - 0.2 * half],
      [half + 0.5, 0],
    ]),
    rotate: -18 * distance || 0,
  };
}
