import type { Side } from '../model/project';
import { GRID_SIZE } from './device';

export type Point = { x: number; y: number };
export type Axis = 'x' | 'y';

export const routeAxis = (side: Side): Axis =>
  side === 'left' || side === 'right' ? 'x' : 'y';

export function terminalExit(point: Point, side: Side): Point {
  return {
    x:
      point.x +
      (side === 'left' ? -GRID_SIZE : side === 'right' ? GRID_SIZE : 0),
    y:
      point.y +
      (side === 'top' ? -GRID_SIZE : side === 'bottom' ? GRID_SIZE : 0),
  };
}

export function routeTo(from: Point, to: Point, firstAxis: Axis): Point[] {
  if (from.x === to.x && from.y === to.y) return [];
  if (from.x === to.x || from.y === to.y) return [to];
  return [
    firstAxis === 'x' ? { x: to.x, y: from.y } : { x: from.x, y: to.y },
    to,
  ];
}

export function wirePath(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
  routePoints: Point[] = [],
) {
  const start = terminalExit(source, sourceSide);
  const end = terminalExit(target, targetSide);
  const anchors = [start, ...routePoints, end];
  const firstAxis = routeAxis(sourceSide);
  const points = [source, start];
  const segments: { from: Point; to: Point; insertIndex: number }[] = [
    { from: source, to: start, insertIndex: 0 },
  ];
  anchors.slice(1).forEach((anchor, index) => {
    for (const point of routeTo(anchors[index], anchor, firstAxis)) {
      const from = points.at(-1)!;
      points.push(point);
      segments.push({ from, to: point, insertIndex: index });
    }
  });
  points.push(target);
  segments.push({ from: end, to: target, insertIndex: routePoints.length });
  const longest = segments.reduce<
    (typeof segments)[number] & { length: number }
  >(
    (best, segment) => {
      const length =
        Math.abs(segment.to.x - segment.from.x) +
        Math.abs(segment.to.y - segment.from.y);
      return length > best.length ? { ...segment, length } : best;
    },
    { ...segments[0], length: 0 },
  );
  return {
    points,
    segments,
    path: points
      .map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`)
      .join(' '),
    label: {
      x: (longest.from.x + longest.to.x) / 2,
      y: (longest.from.y + longest.to.y) / 2,
    },
  };
}

export function insertionIndex(
  segments: ReturnType<typeof wirePath>['segments'],
  point: Point,
): number {
  const nearest = segments.reduce(
    (best, segment) => {
      const x = Math.max(
        Math.min(segment.from.x, segment.to.x),
        Math.min(point.x, Math.max(segment.from.x, segment.to.x)),
      );
      const y = Math.max(
        Math.min(segment.from.y, segment.to.y),
        Math.min(point.y, Math.max(segment.from.y, segment.to.y)),
      );
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
      return distance < best.distance
        ? { distance, index: segment.insertIndex }
        : best;
    },
    { distance: Infinity, index: 0 },
  );
  return nearest.index;
}
