import type { Project, WireEndpoint } from '../model/project';
import { deviceTerminalLayout } from './device';
import { wirePath, type Point } from './wireGeometry';

export function terminalPoint(
  project: Project,
  endpoint: WireEndpoint,
): Point | null {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  return device
    ? (deviceTerminalLayout(device).find(
        ({ terminal }) => terminal.id === endpoint.terminalId,
      )?.point ?? null)
    : null;
}

export function collapsedHarnessGeometry(project: Project, harnessId: string) {
  const harness = project.harnesses.find((item) => item.id === harnessId);
  const route = harness?.route;
  if (!harness || !route) return null;
  const wires = project.wires.filter((wire) => wire.harnessId === harnessId);
  const trunk = wirePath(
    route.sourceJunction,
    route.targetJunction,
    route.trunkPoints,
  );
  const paths: {
    kind: 'trunk' | 'source' | 'target';
    wireId?: string;
    points: Point[];
    path: string;
    color: string;
  }[] = [
    {
      kind: 'trunk',
      points: trunk.points,
      path: trunk.path,
      color: harness.color,
    },
  ];
  for (const wire of wires) {
    const branch = route.branches.find((item) => item.wireId === wire.id);
    if (!branch) return null;
    const source = terminalPoint(
      project,
      wire.source.deviceId === route.sourceDeviceId ? wire.source : wire.target,
    );
    const target = terminalPoint(
      project,
      wire.target.deviceId === route.targetDeviceId ? wire.target : wire.source,
    );
    if (!source || !target) return null;
    const sourcePath = wirePath(
      source,
      route.sourceJunction,
      branch.sourcePoints,
    );
    const targetPath = wirePath(
      target,
      route.targetJunction,
      branch.targetPoints,
    );
    paths.push(
      {
        kind: 'source',
        wireId: wire.id,
        points: sourcePath.points,
        path: sourcePath.path,
        color: wire.color || harness.color,
      },
      {
        kind: 'target',
        wireId: wire.id,
        points: targetPath.points,
        path: targetPath.path,
        color: wire.color || harness.color,
      },
    );
  }
  return {
    trunk: trunk.path,
    branches: paths
      .slice(1)
      .map((item) => item.path)
      .join(' '),
    label: trunk.label,
    paths,
  };
}
