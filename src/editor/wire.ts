import type { Project, Wire, WireEndpoint } from '../model/project';

function sameEndpoint(a: WireEndpoint, b: WireEndpoint): boolean {
  return a.deviceId === b.deviceId && a.terminalId === b.terminalId;
}

export function addWire(
  project: Project,
  source: WireEndpoint,
  target: WireEndpoint,
): Project {
  const sourceDevice = project.devices.find(
    (device) => device.id === source.deviceId,
  );
  const targetDevice = project.devices.find(
    (device) => device.id === target.deviceId,
  );
  const sourceTerminal = sourceDevice?.templateSnapshot.terminals.find(
    (terminal) => terminal.id === source.terminalId,
  );
  const targetTerminal = targetDevice?.templateSnapshot.terminals.find(
    (terminal) => terminal.id === target.terminalId,
  );
  if (!sourceTerminal || !targetTerminal)
    throw new Error('连接失败：设备或端子不存在');
  if (sameEndpoint(source, target)) throw new Error('不能将端子连接到自身');

  const sourceType = project.terminalTypes.find(
    (type) => type.id === sourceTerminal.typeId,
  );
  const targetType = project.terminalTypes.find(
    (type) => type.id === targetTerminal.typeId,
  );
  if (
    !sourceType ||
    !targetType ||
    !sourceType.compatibleTypeIds.includes(targetType.id) ||
    !targetType.compatibleTypeIds.includes(sourceType.id)
  )
    throw new Error('连接失败：端子类型不兼容');

  if (
    project.wires.some(
      (wire) =>
        (sameEndpoint(wire.source, source) &&
          sameEndpoint(wire.target, target)) ||
        (sameEndpoint(wire.source, target) &&
          sameEndpoint(wire.target, source)),
    )
  )
    throw new Error('这两个端子已经连接');

  for (const [endpoint, terminal] of [
    [source, sourceTerminal],
    [target, targetTerminal],
  ] as const) {
    const used = project.wires.filter(
      (wire) =>
        sameEndpoint(wire.source, endpoint) ||
        sameEndpoint(wire.target, endpoint),
    ).length;
    if (terminal.maxConnections !== null && used >= terminal.maxConnections)
      throw new Error(`端子“${terminal.label}”已达到连接上限`);
  }

  const wire: Wire = {
    id: crypto.randomUUID(),
    source,
    target,
    color: sourceType.color,
  };
  return { ...project, wires: [...project.wires, wire] };
}
