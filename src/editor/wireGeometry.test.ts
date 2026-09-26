import { expect, test } from 'vitest';
import { insertionIndex, wirePath } from './wireGeometry';

test('wires connect exactly the ordered points, including diagonal segments', () => {
  const source = { x: 180, y: 90 };
  const target = { x: 420, y: 180 };
  const routePoints = [
    { x: 270, y: 150 },
    { x: 330, y: 150 },
  ];
  const geometry = wirePath(source, target, routePoints);
  expect(geometry.points).toEqual([source, ...routePoints, target]);
  expect(geometry.path).toBe('M180 90 L270 150 L330 150 L420 180');
  expect(wirePath(source, target).path).toBe('M180 90 L420 180');
  expect(wirePath(source, target, [routePoints[1]]).path).toBe(
    'M180 90 L330 150 L420 180',
  );
});

test('places the label halfway along the complete wire length', () => {
  const geometry = wirePath({ x: 0, y: 0 }, { x: 300, y: 120 }, [
    { x: 90, y: 120 },
    { x: 240, y: 120 },
  ]);
  expect(geometry.label).toEqual({ x: 120, y: 120 });
  expect(wirePath({ x: 0, y: 0 }, { x: 60, y: 0 }).label).toEqual({
    x: 30,
    y: 0,
  });
});

test('new point is inserted into the nearest segment in drawing order', () => {
  const geometry = wirePath({ x: 0, y: 0 }, { x: 180, y: 0 }, [
    { x: 90, y: 90 },
  ]);
  expect(insertionIndex(geometry.segments, { x: 60, y: 30 })).toBe(0);
  expect(insertionIndex(geometry.segments, { x: 120, y: 30 })).toBe(1);
});
