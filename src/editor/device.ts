import type {
  DeviceInstance,
  DeviceTemplate,
  Project,
  Side,
  TerminalDefinition,
  TerminalType,
} from '../model/project';

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
export const GRID_SIZE = 30;
export const TEMPLATE_DRAG_TYPE = 'application/wirelink-device-template';
export const MIN_DEVICE_WIDTH = 180;
export const MIN_DEVICE_HEIGHT = 120;

export const snapToGrid = (value: number) =>
  Math.round(value / GRID_SIZE) * GRID_SIZE || 0;
export const snapPointToGrid = (point: { x: number; y: number }) => ({
  x: snapToGrid(point.x),
  y: snapToGrid(point.y),
});
export const snapSizeToGrid = (value: number, minimum: number) =>
  Math.max(minimum, snapToGrid(Number.isFinite(value) ? value : minimum));
const growToGrid = (value: number) => Math.ceil(value / GRID_SIZE) * GRID_SIZE;
export const terminalOffset = (
  sideLength: number,
  count: number,
  index: number,
) =>
  Math.floor((sideLength - (count - 1) * GRID_SIZE) / (2 * GRID_SIZE)) *
    GRID_SIZE +
  index * GRID_SIZE;
export function deviceTerminalLayout(device: DeviceInstance) {
  const { width, height } = getDeviceSize(device);
  const { x, y } = device.position;
  return SIDES.flatMap((side) => {
    const terminals = device.templateSnapshot.terminals
      .filter((terminal) => terminal.side === side)
      .sort((a, b) => a.order - b.order);
    return terminals.map((terminal, index) => {
      const offset = terminalOffset(
        side === 'top' || side === 'bottom' ? width : height,
        terminals.length,
        index,
      );
      const point =
        side === 'top'
          ? { x: x + offset, y }
          : side === 'bottom'
            ? { x: x + offset, y: y + height }
            : side === 'left'
              ? { x, y: y + offset }
              : { x: x + width, y: y + offset };
      return { terminal, side, count: terminals.length, offset, point };
    });
  });
}
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
    height: 180,
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
    width: growToGrid(
      Math.max(
        device.size?.width ?? device.templateSnapshot.width,
        (horizontal + 1) * 76,
        MIN_DEVICE_WIDTH,
      ),
    ),
    height: growToGrid(
      Math.max(
        device.size?.height ?? device.templateSnapshot.height,
        (vertical + 1) * 48,
        MIN_DEVICE_HEIGHT,
      ),
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
    position: snapPointToGrid(position),
    note: template.note,
  };
  return { ...project, devices: [...project.devices, instance] };
}
