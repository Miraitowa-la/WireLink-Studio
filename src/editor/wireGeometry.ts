export type Point = { x: number; y: number };

export function wirePath(
  source: Point,
  target: Point,
  routePoints: Point[] = [],
) {
  const points = [source, ...routePoints, target];
  const segments = points.slice(1).map((to, insertIndex) => ({
    from: points[insertIndex],
    to,
    insertIndex,
  }));
  const lengths = segments.map((segment) =>
    Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y),
  );
  let distance = lengths.reduce((total, length) => total + length, 0) / 2;
  let label = source;
  for (const [index, segment] of segments.entries()) {
    const length = lengths[index];
    if (distance > length && index < segments.length - 1) {
      distance -= length;
      continue;
    }
    const fraction = length ? distance / length : 0;
    label = {
      x: segment.from.x + (segment.to.x - segment.from.x) * fraction,
      y: segment.from.y + (segment.to.y - segment.from.y) * fraction,
    };
    break;
  }
  return {
    points,
    segments,
    path: points
      .map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`)
      .join(' '),
    label,
  };
}

export function insertionIndex(
  segments: ReturnType<typeof wirePath>['segments'],
  point: Point,
): number {
  const nearest = segments.reduce(
    (best, segment) => {
      const dx = segment.to.x - segment.from.x;
      const dy = segment.to.y - segment.from.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - segment.from.x) * dx +
                (point.y - segment.from.y) * dy) /
                lengthSquared,
            ),
          )
        : 0;
      const x = segment.from.x + t * dx;
      const y = segment.from.y + t * dy;
      const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
      return distance < best.distance
        ? { distance, index: segment.insertIndex }
        : best;
    },
    { distance: Infinity, index: 0 },
  );
  return nearest.index;
}
