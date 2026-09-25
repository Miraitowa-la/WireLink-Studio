import type {
  DeviceInstance,
  DeviceTemplate,
  Project,
  Side,
  TerminalDefinition,
  TerminalType,
} from '../model/project';

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
export const SIDE_LABELS: Record<Side, string> = {
  top: '上边',
  right: '右边',
  bottom: '下边',
  left: '左边',
};

export function createTerminalType(): TerminalType {
  const id = crypto.randomUUID();
  return {
    id,
    name: '新端子类型',
    color: '#2563eb',
    compatibleTypeIds: [id],
  };
}

export function createDeviceTemplate(): DeviceTemplate {
  return {
    id: crypto.randomUUID(),
    name: '新设备',
    category: '',
    width: 240,
    height: 160,
    appearance: { kind: 'default' },
    terminals: [],
  };
}

export function createTerminal(
  side: Side,
  typeId: string,
  order: number,
): TerminalDefinition {
  return {
    id: crypto.randomUUID(),
    label: '端子',
    typeId,
    side,
    order,
    maxConnections: 1,
  };
}

export function reorderTerminals(
  terminals: TerminalDefinition[],
  side: Side,
  movedId: string,
  targetId: string,
): TerminalDefinition[] {
  const ordered = terminals
    .filter((terminal) => terminal.side === side)
    .sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((terminal) => terminal.id === movedId);
  const to = ordered.findIndex((terminal) => terminal.id === targetId);
  if (from < 0 || to < 0 || from === to) return terminals;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const orderById = new Map(
    ordered.map((terminal, order) => [terminal.id, order]),
  );
  return terminals.map((terminal) =>
    terminal.side === side
      ? { ...terminal, order: orderById.get(terminal.id)! }
      : terminal,
  );
}

export function getDeviceSize(device: DeviceInstance): {
  width: number;
  height: number;
} {
  const terminals = device.templateSnapshot.terminals;
  const horizontal = Math.max(
    terminals.filter((terminal) => terminal.side === 'top').length,
    terminals.filter((terminal) => terminal.side === 'bottom').length,
  );
  const vertical = Math.max(
    terminals.filter((terminal) => terminal.side === 'left').length,
    terminals.filter((terminal) => terminal.side === 'right').length,
  );
  return {
    width: Math.max(
      device.size?.width ?? device.templateSnapshot.width,
      (horizontal + 1) * 76,
      180,
    ),
    height: Math.max(
      device.size?.height ?? device.templateSnapshot.height,
      (vertical + 1) * 48,
      120,
    ),
  };
}

export function addDevice(
  project: Project,
  template: DeviceTemplate,
  position: { x: number; y: number },
): Project {
  const instance: DeviceInstance = {
    id: crypto.randomUUID(),
    templateId: template.id,
    templateSnapshot: structuredClone(template),
    name: template.name,
    position,
    note: template.note,
  };
  return { ...project, devices: [...project.devices, instance] };
}
