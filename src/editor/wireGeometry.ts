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
  const longest = segments.reduce((best, segment) =>
    Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y) >
    Math.hypot(best.to.x - best.from.x, best.to.y - best.from.y)
      ? segment
      : best,
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
