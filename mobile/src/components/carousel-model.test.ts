import {
  HIGHLIGHT_PADDING,
  carouselTransform,
  highlightWidth,
  isRing,
  itemDistance,
  ringDistance,
  rubberBand,
  snapIndex,
  spinDuration,
  tabAt,
  tapTurn,
  wrap,
} from '@/components/carousel-model';

describe('snapIndex', () => {
  test('a slow release settles on the nearest tab', () => {
    expect(snapIndex(1, 1.4, 0)).toBe(1);
    expect(snapIndex(1, 1.6, 0)).toBe(2);
  });

  test('a flick moves one tab even when the drag was short', () => {
    expect(snapIndex(1, 1.1, 3)).toBe(2);
    expect(snapIndex(1, 0.9, -3)).toBe(0);
  });

  test('a flick against the drag does not jump past the start', () => {
    expect(snapIndex(1, 1.2, -3)).toBe(1);
  });

  test('a hard flick spins through several tabs, like a revolver barrel', () => {
    expect(snapIndex(0, 0.5, 30)).toBeGreaterThanOrEqual(5);
    expect(snapIndex(0, -0.5, -30)).toBeLessThanOrEqual(-5);
  });

  test('flicking twice as fast spins more than twice as far', () => {
    const slow = snapIndex(0, 0, 15);
    const fast = snapIndex(0, 0, 30);
    expect(fast).toBeGreaterThan(slow * 2);
  });

  test('carries on round past either end', () => {
    expect(snapIndex(0, -0.6, 0)).toBe(-1);
    expect(snapIndex(4, 4.1, 3)).toBe(5);
  });
});

describe('spinDuration', () => {
  test('a longer spin takes longer, within bounds', () => {
    expect(spinDuration(6, 30)).toBeGreaterThan(spinDuration(2, 30));
    expect(spinDuration(0.1, 30)).toBeGreaterThanOrEqual(250);
    expect(spinDuration(100, 1)).toBeLessThanOrEqual(1600);
  });

  test('starts at the speed of the flick', () => {
    // An ease-out cubic starts at three times its average speed.
    expect(spinDuration(6, 30)).toBeCloseTo(((3 * 6) / 30) * 1000);
  });
});

describe('wrap', () => {
  test('turns any position on the ring into a tab', () => {
    expect(wrap(0, 5)).toBe(0);
    expect(wrap(4, 5)).toBe(4);
    expect(wrap(5, 5)).toBe(0);
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(-6, 5)).toBe(4);
  });
});

describe('ringDistance', () => {
  test('is the shorter way round, negative to the left', () => {
    expect(ringDistance(0, 1, 5)).toBe(1);
    expect(ringDistance(0, 4, 5)).toBe(-1);
    expect(ringDistance(4, 0, 5)).toBe(1);
    expect(ringDistance(0, 2, 5)).toBe(2);
    expect(ringDistance(0, 3, 5)).toBe(-2);
  });

  test('works from positions past the ends and between tabs', () => {
    expect(ringDistance(-1, 4, 5)).toBe(0);
    expect(ringDistance(7, 1, 5)).toBe(-1);
    expect(ringDistance(0.5, 0, 5)).toBe(-0.5);
  });
});

describe('tapTurn', () => {
  // A 500-point bar of five 100-point slots, at rest on tab 3.
  const turn = (x: number, position = 3) => tapTurn(x, 500, 5, position, 3);

  test('the slot tapped is how many tabs to turn, negative to the left', () => {
    expect(turn(250)).toBe(0);
    expect(turn(340)).toBe(1);
    expect(turn(160)).toBe(-1);
    expect(turn(10)).toBe(-2);
    expect(turn(495)).toBe(2);
  });

  test('never reaches past the tabs on show', () => {
    expect(turn(-50)).toBe(-2);
    expect(turn(600)).toBe(2);
  });

  test('a tap while the bar is still moving picks nothing', () => {
    expect(turn(340, 3.4)).toBeNull();
    expect(turn(340, 1)).toBeNull();
    expect(turn(340, 3.01)).toBe(1);
  });
});

describe('highlightWidth', () => {
  const labels = [40, 70, 50];

  test('wraps the centred label with room to spare, but never narrower than the minimum', () => {
    expect(highlightWidth(1, labels, 60)).toBe(70 + 2 * HIGHLIGHT_PADDING);
    expect(highlightWidth(0, [10, 10, 10], 60)).toBe(60);
  });

  test('blends between two labels mid-swipe', () => {
    expect(highlightWidth(0.5, labels, 0)).toBe(55 + 2 * HIGHLIGHT_PADDING);
  });

  test('works round the ring', () => {
    expect(highlightWidth(-1, labels, 0)).toBe(50 + 2 * HIGHLIGHT_PADDING);
    expect(highlightWidth(2.5, labels, 0)).toBe(45 + 2 * HIGHLIGHT_PADDING);
  });

  test('labels not measured yet fall back to the minimum', () => {
    expect(highlightWidth(0, [], 60)).toBe(60);
  });
});

describe('carouselTransform', () => {
  test('the centred tab is full size', () => {
    expect(carouselTransform(0)).toEqual({ scale: 1, opacity: 1, rotate: 0 });
  });

  test('tabs to the sides shrink a little and turn away like a wheel, but stay readable', () => {
    const left = carouselTransform(-2);
    const right = carouselTransform(2);
    expect(right.scale).toBeLessThan(carouselTransform(1).scale);
    expect(right.scale).toBeGreaterThanOrEqual(0.75);
    expect(right.opacity).toBeGreaterThan(0.5);
    expect(right.rotate).toBeLessThan(0);
    expect(left.rotate).toBe(-right.rotate);
    expect(left.scale).toBe(right.scale);
  });

  test('a tab fades out as it goes round the back to the other end', () => {
    expect(carouselTransform(2.5).opacity).toBe(0);
    expect(carouselTransform(-2.5).opacity).toBe(0);
  });

  test('a narrower carousel fades its tabs out sooner', () => {
    expect(carouselTransform(1, 1).opacity).toBeGreaterThan(0.5);
    expect(carouselTransform(1.5, 1).opacity).toBe(0);
  });
});

describe('carousels with ends', () => {
  test('only a carousel with at least as many tabs as slots goes round in a ring', () => {
    expect(isRing(7, 5)).toBe(true);
    expect(isRing(5, 5)).toBe(true);
    expect(isRing(3, 5)).toBe(false);
    expect(isRing(3, 3)).toBe(true);
  });

  test('without a ring, tabs sit in a row and positions stop at the ends', () => {
    expect(itemDistance(0, 2, 3, false)).toBe(2);
    expect(itemDistance(2, 0, 3, false)).toBe(-2);
    expect(tabAt(-0.4, 3, false)).toBe(0);
    expect(tabAt(5, 3, false)).toBe(2);
    expect(tabAt(-1, 3, true)).toBe(2);
  });

  test('dragging past either end meets resistance, never more than half a tab', () => {
    expect(rubberBand(1.5, 3)).toBe(1.5);
    expect(rubberBand(-1, 3)).toBeLessThan(0);
    expect(rubberBand(-100, 3)).toBeGreaterThan(-0.5);
    expect(rubberBand(3, 3)).toBeGreaterThan(2);
    expect(rubberBand(30, 3)).toBeLessThan(2.5);
  });
});
