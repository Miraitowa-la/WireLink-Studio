import { expect, test } from 'vitest';
import { insertionIndex, routeTo, wirePath } from './wireGeometry';

test('manual wire keeps terminal exits, bends and export path orthogonal', () => {
  const source = { x: 180, y: 90 };
  const target = { x: 420, y: 180 };
  const routePoints = [
    { x: 270, y: 90 },
    { x: 270, y: 150 },
    { x: 390, y: 150 },
  ];
  const geometry = wirePath(source, target, 'right', 'left', routePoints);
  expect(geometry.points[1]).toEqual({ x: 210, y: 90 });
  expect(geometry.points.at(-2)).toEqual({ x: 390, y: 180 });
  for (const segment of geometry.segments) {
    expect(
      segment.from.x === segment.to.x || segment.from.y === segment.to.y,
    ).toBe(true);
    for (const coordinate of [segment.to.x, segment.to.y])
      expect(coordinate % 30).toBe(0);
  }
  expect(insertionIndex(geometry.segments, { x: 330, y: 150 })).toBe(2);
  const afterDeletion = wirePath(
    source,
    target,
    'right',
    'left',
    routePoints.filter((_, index) => index !== 1),
  );
  expect(
    afterDeletion.segments.every(
      (segment) =>
        segment.from.x === segment.to.x || segment.from.y === segment.to.y,
    ),
  ).toBe(true);
  expect(routeTo({ x: 210, y: 90 }, { x: 270, y: 150 }, 'y')).toEqual([
    { x: 210, y: 150 },
    { x: 270, y: 150 },
  ]);
});
