import type {
  DeviceInstance,
  Project,
  Side,
  WireEndpoint,
} from '../model/project';
import { getDeviceSize, terminalOffset } from './device';

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };

export function terminalPoint(
  project: Project,
  endpoint: WireEndpoint,
): Point | null {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  const terminal = device?.templateSnapshot.terminals.find(
    (item) => item.id === endpoint.terminalId,
  );
  if (!device || !terminal) return null;
  const sameSide = device.templateSnapshot.terminals
    .filter((item) => item.side === terminal.side)
    .sort((a, b) => a.order - b.order);
  const { width, height } = getDeviceSize(device);
  const { x, y } = device.position;
  const offset = terminalOffset(
    terminal.side === 'top' || terminal.side === 'bottom' ? width : height,
    sameSide.length,
    sameSide.findIndex((item) => item.id === terminal.id),
  );
  switch (terminal.side) {
    case 'top':
      return { x: x + offset, y };
    case 'bottom':
      return { x: x + offset, y: y + height };
    case 'left':
      return { x, y: y + offset };
    case 'right':
      return { x: x + width, y: y + offset };
  }
}

function endpointInfo(project: Project, endpoint: WireEndpoint) {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  const terminal = device?.templateSnapshot.terminals.find(
    (item) => item.id === endpoint.terminalId,
  );
  const point = terminalPoint(project, endpoint);
  if (!device || !terminal || !point) return null;
  return {
    point,
    side: terminal.side,
    box: { ...device.position, ...getDeviceSize(device) },
  };
}

const path = (points: Point[]) =>
  points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${Number(point.x.toFixed(2))} ${Number(point.y.toFixed(2))}`,
    )
    .join(' ');

function branch(
  point: Point,
  side: Side,
  box: Box,
  junction: Point,
  axis: 'x' | 'y',
  face: Side,
): Point[] {
  const exit = {
    x: point.x + (side === 'left' ? -24 : side === 'right' ? 24 : 0),
    y: point.y + (side === 'top' ? -24 : side === 'bottom' ? 24 : 0),
  };
  const points = [point, exit];
  if (side === face) {
    points.push(
      axis === 'x'
        ? { x: junction.x, y: exit.y }
        : { x: exit.x, y: junction.y },
    );
  } else if (axis === 'x' && (side === 'left' || side === 'right')) {
    const outerY =
      point.y < box.y + box.height / 2 ? box.y - 24 : box.y + box.height + 24;
    points.push({ x: exit.x, y: outerY }, { x: junction.x, y: outerY });
  } else if (axis === 'y' && (side === 'top' || side === 'bottom')) {
    const outerX =
      point.x < box.x + box.width / 2 ? box.x - 24 : box.x + box.width + 24;
    points.push({ x: outerX, y: exit.y }, { x: outerX, y: junction.y });
  } else {
    points.push(
      axis === 'x'
        ? { x: junction.x, y: exit.y }
        : { x: exit.x, y: junction.y },
    );
  }
  points.push(junction);
  return points;
}

export function collapsedHarnessGeometry(project: Project, harnessId: string) {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  const wires = project.wires.filter((wire) => wire.harnessId === harnessId);
  if (!harness || !wires.length) return null;
  const pairs = wires.map((wire) => ({
    source: endpointInfo(project, wire.source),
    target: endpointInfo(project, wire.target),
  }));
  if (pairs.some((pair) => !pair.source || !pair.target)) return null;
  const sourceDevice = project.devices.find(
    (item) => item.id === wires[0].source.deviceId,
  ) as DeviceInstance;
  const targetDevice = project.devices.find(
    (item) => item.id === wires[0].target.deviceId,
  ) as DeviceInstance;
  const sourceBox = {
    ...sourceDevice.position,
    ...getDeviceSize(sourceDevice),
  };
  const targetBox = {
    ...targetDevice.position,
    ...getDeviceSize(targetDevice),
  };
  const sourceCenter = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  };
  const targetCenter = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  const axis =
    Math.abs(targetCenter.x - sourceCenter.x) >=
    Math.abs(targetCenter.y - sourceCenter.y)
      ? 'x'
      : 'y';
  const forward = targetCenter[axis] >= sourceCenter[axis];
  const sourceFace: Side =
    axis === 'x' ? (forward ? 'right' : 'left') : forward ? 'bottom' : 'top';
  const targetFace: Side =
    axis === 'x' ? (forward ? 'left' : 'right') : forward ? 'top' : 'bottom';
  const sourceEdge =
    axis === 'x'
      ? sourceBox.x + (forward ? sourceBox.width : 0)
      : sourceBox.y + (forward ? sourceBox.height : 0);
  const targetEdge =
    axis === 'x'
      ? targetBox.x + (forward ? 0 : targetBox.width)
      : targetBox.y + (forward ? 0 : targetBox.height);
  const gap = Math.abs(targetEdge - sourceEdge);
  const lead = Math.min(32, gap / 4);
  const cross =
    pairs.reduce(
      (sum, pair) =>
        sum +
        (pair.source!.point[axis === 'x' ? 'y' : 'x'] +
          pair.target!.point[axis === 'x' ? 'y' : 'x']) /
          2,
      0,
    ) / pairs.length;
  const sourceJunction =
    axis === 'x'
      ? { x: sourceEdge + (forward ? lead : -lead), y: cross }
      : { x: cross, y: sourceEdge + (forward ? lead : -lead) };
  const targetJunction =
    axis === 'x'
      ? { x: targetEdge + (forward ? -lead : lead), y: cross }
      : { x: cross, y: targetEdge + (forward ? -lead : lead) };
  const trunkPoints = [sourceJunction];
  for (const point of harness.routePoints ?? []) {
    trunkPoints.push({ x: point.x, y: trunkPoints.at(-1)!.y }, point);
  }
  trunkPoints.push(
    axis === 'x'
      ? { x: targetJunction.x, y: trunkPoints.at(-1)!.y }
      : { x: trunkPoints.at(-1)!.x, y: targetJunction.y },
    targetJunction,
  );
  const branches = pairs
    .flatMap((pair) => [
      path(
        branch(
          pair.source!.point,
          pair.source!.side,
          pair.source!.box,
          sourceJunction,
          axis,
          sourceFace,
        ),
      ),
      path(
        branch(
          pair.target!.point,
          pair.target!.side,
          pair.target!.box,
          targetJunction,
          axis,
          targetFace,
        ),
      ),
    ])
    .join(' ');
  const longest = trunkPoints.slice(1).reduce(
    (best, end, index) => {
      const start = trunkPoints[index];
      const length = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
      return length > best.length ? { start, end, length } : best;
    },
    { start: sourceJunction, end: targetJunction, length: 0 },
  );
  const labelText = `${harness.number || harness.name} · ${wires.length} 芯`;
  const label =
    longest.length >= Math.min(220, labelText.length * 8.2 + 20) + 12
      ? {
          x: (longest.start.x + longest.end.x) / 2,
          y: (longest.start.y + longest.end.y) / 2,
        }
      : {
          x: axis === 'x' ? (sourceJunction.x + targetJunction.x) / 2 : cross,
          y: Math.min(sourceBox.y, targetBox.y) - 24,
        };
  return { trunk: path(trunkPoints), branches, label };
}
