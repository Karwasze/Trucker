import type { Muscle } from '@/api/types';

/** Each figure is drawn in a box this size, facing the viewer, centred on x = WIDTH / 2. */
export const WIDTH = 120;
export const HEIGHT = 260;

type Point = [number, number];

/** A region of a figure: a muscle, or null for the body underneath. */
export type Shape = { muscle: Muscle | null; d: string };

const mirror = (points: Point[]): Point[] => points.map(([x, y]) => [WIDTH - x, y]);

/** A closed, smooth path through `points` (a Catmull-Rom spline as cubic Béziers). */
export function smoothPath(points: Point[]) {
  const at = (i: number) => points[(i + points.length) % points.length];
  const round = (n: number) => Math.round(n * 10) / 10;
  let d = `M${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${round(c1[0])},${round(c1[1])} ${round(c2[0])},${round(c2[1])} ${round(p2[0])},${round(p2[1])}`;
  }
  return `${d}Z`;
}

/** Both sides of a muscle, from its outline on the figure's left (the viewer's right). */
const both = (muscle: Muscle, points: Point[]): Shape[] => [
  { muscle, d: smoothPath(points) },
  { muscle, d: smoothPath(mirror(points)) },
];

const centre = (muscle: Muscle, points: Point[]): Shape => ({ muscle, d: smoothPath(points) });

/**
 * Half of the body's outline, from the neck down the outside of the arm and
 * leg and back up the inside to the crotch; mirrored for the other half.
 */
const HALF_OUTLINE: Point[] = [
  [60, 33],
  [67, 34],
  [68, 42],
  [82, 47],
  [93, 54],
  [97, 66],
  [99, 84],
  [101, 100],
  [105, 122],
  [107, 139],
  [110, 150],
  [108, 160],
  [102, 158],
  [99, 141],
  [93, 120],
  [89, 102],
  [86, 84],
  [82, 72],
  [80, 96],
  [77, 114],
  [82, 130],
  [84, 158],
  [80, 190],
  [83, 210],
  [78, 240],
  [82, 252],
  [67, 254],
  [66, 240],
  [64, 210],
  [65, 190],
  [62, 152],
  [60, 142],
];

const OUTLINE = smoothPath([...HALF_OUTLINE, ...mirror(HALF_OUTLINE).reverse().slice(1, -1)]);

/** The head, as an ellipse: centre and radii. */
export const HEAD = { cx: 60, cy: 19, rx: 12, ry: 15 };

const BODY: Shape = { muscle: null, d: OUTLINE };

const SHOULDER: Point[] = [
  [78, 49],
  [88, 50],
  [95, 57],
  [97, 68],
  [92, 74],
  [86, 66],
  [80, 57],
];

const CALF_FRONT: Point[] = [
  [71, 200],
  [79, 198],
  [81, 212],
  [77, 230],
  [72, 232],
  [68, 214],
];

export const FRONT: Shape[] = [
  BODY,
  ...both('shoulders', SHOULDER),
  ...both('chest', [
    [61, 52],
    [76, 50],
    [84, 57],
    [85, 67],
    [81, 76],
    [70, 80],
    [61, 77],
  ]),
  ...both('biceps', [
    [87, 75],
    [92, 75],
    [97, 83],
    [98, 95],
    [94, 100],
    [90, 97],
    [87, 87],
  ]),
  centre('core', [
    [54, 83],
    [66, 83],
    [68, 102],
    [67, 124],
    [60, 133],
    [53, 124],
    [52, 102],
  ]),
  ...both('core', [
    [71, 83],
    [78, 92],
    [78, 111],
    [74, 122],
    [70, 106],
  ]),
  ...both('quads', [
    [68, 138],
    [80, 131],
    [84, 148],
    [83, 170],
    [78, 186],
    [70, 188],
    [65, 170],
    [63, 150],
  ]),
  ...both('calves', CALF_FRONT),
];

export const BACK: Shape[] = [
  BODY,
  centre('back', [
    [60, 36],
    [68, 42],
    [80, 49],
    [70, 57],
    [64, 70],
    [60, 81],
    [56, 70],
    [50, 57],
    [40, 49],
    [52, 42],
  ]),
  ...both('back', [
    [67, 72],
    [78, 61],
    [84, 70],
    [82, 90],
    [76, 106],
    [68, 112],
    [66, 95],
  ]),
  centre('core', [
    [55, 85],
    [65, 85],
    [66, 112],
    [60, 117],
    [54, 112],
  ]),
  ...both('shoulders', SHOULDER),
  ...both('triceps', [
    [87, 73],
    [94, 71],
    [98, 82],
    [98, 96],
    [93, 100],
    [89, 94],
    [86, 83],
  ]),
  ...both('glutes', [
    [61, 119],
    [74, 115],
    [82, 124],
    [83, 138],
    [76, 146],
    [64, 146],
    [61, 136],
  ]),
  ...both('hamstrings', [
    [64, 151],
    [78, 149],
    [83, 161],
    [80, 182],
    [73, 188],
    [66, 184],
    [63, 166],
  ]),
  ...both('calves', [
    [66, 196],
    [78, 194],
    [82, 206],
    [79, 224],
    [73, 230],
    [68, 226],
    [65, 210],
  ]),
];
