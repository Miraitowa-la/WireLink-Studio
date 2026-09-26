import type {
  HarnessConnection,
  HarnessRoute,
  Project,
  Wire,
} from '../model/project';

export function selectedHarnessWires(
  project: Project,
  wireIds: string[],
): Wire[] {
  if (new Set(wireIds).size < 2) throw new Error('请至少选择两条导线');
  const wires = wireIds.map((id) =>
    project.wires.find((wire) => wire.id === id),
  );
  if (wires.some((wire) => !wire)) throw new Error('所选导线不存在');
  const selected = wires as Wire[];
  if (selected.some((wire) => wire.harnessId))
    throw new Error('所选导线已属于其他线束');
  const pair = [
    selected[0].source.deviceId,
    selected[0].target.deviceId,
  ].sort();
  if (
    pair[0] === pair[1] ||
    selected.some(
      (wire) =>
        [wire.source.deviceId, wire.target.deviceId].sort().join('\0') !==
        pair.join('\0'),
    )
  )
    throw new Error('所选导线必须连接同一对设备');
  return selected;
}

export function createHarnessFromWires(
  project: Project,
  wireIds: string[],
  details: Pick<
    HarnessConnection,
    'name' | 'number' | 'color' | 'note' | 'cableModel' | 'shielded'
  >,
): Project {
  selectedHarnessWires(project, wireIds);
  if (!details.name.trim()) throw new Error('请填写线束名称');
  const id = crypto.randomUUID();
  return {
    ...project,
    wires: project.wires.map((wire) =>
      wireIds.includes(wire.id) ? { ...wire, harnessId: id } : wire,
    ),
    harnesses: [
      ...project.harnesses,
      {
        id,
        name: details.name.trim(),
        number: details.number?.trim(),
        color: details.color,
        note: details.note?.trim(),
        cableModel: details.cableModel?.trim(),
        shielded: details.shielded,
        collapsed: false,
      },
    ],
  };
}

export function routeHarness(
  project: Project,
  harnessId: string,
  route: HarnessRoute,
): Project {
  const wires = project.wires.filter((wire) => wire.harnessId === harnessId);
  const harness = project.harnesses.find((item) => item.id === harnessId);
  if (!harness || wires.length < 2) throw new Error('线束或芯线不存在');
  if (
    route.sourceDeviceId === route.targetDeviceId ||
    wires.some(
      (wire) =>
        ![wire.source.deviceId, wire.target.deviceId].includes(
          route.sourceDeviceId,
        ) ||
        ![wire.source.deviceId, wire.target.deviceId].includes(
          route.targetDeviceId,
        ),
    )
  )
    throw new Error('线束两侧设备不一致');
  if (
    route.branches.length !== wires.length ||
    wires.some(
      (wire) => !route.branches.some((branch) => branch.wireId === wire.id),
    )
  )
    throw new Error('线束分支与芯线不一致');
  return {
    ...project,
    harnesses: project.harnesses.map((item) =>
      item.id === harnessId ? { ...item, route, collapsed: true } : item,
    ),
  };
}

export function ungroupHarness(project: Project, harnessId: string): Project {
  return {
    ...project,
    harnesses: project.harnesses.filter((item) => item.id !== harnessId),
    wires: project.wires.map((wire) =>
      wire.harnessId === harnessId ? { ...wire, harnessId: undefined } : wire,
    ),
  };
}

export function removeWire(project: Project, wireId: string): Project {
  const removed = project.wires.find((wire) => wire.id === wireId);
  const next = {
    ...project,
    wires: project.wires.filter((wire) => wire.id !== wireId),
  };
  if (!removed?.harnessId) return next;
  const siblings = next.wires.filter(
    (wire) => wire.harnessId === removed.harnessId,
  );
  if (siblings.length < 2) return ungroupHarness(next, removed.harnessId);
  return {
    ...next,
    harnesses: next.harnesses.map((harness) =>
      harness.id === removed.harnessId
        ? {
            ...harness,
            route: harness.route && {
              ...harness.route,
              branches: harness.route.branches.filter(
                (branch) => branch.wireId !== wireId,
              ),
            },
          }
        : harness,
    ),
  };
}
