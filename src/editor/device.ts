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
export const MIN_DEVICE_WIDTH = 120;
export const MIN_DEVICE_HEIGHT = 120;

export const snapToGrid = (value: number, step = GRID_SIZE) =>
  Math.round(value / step) * step || 0;
export const snapPointToGrid = (
  point: { x: number; y: number },
  step = GRID_SIZE,
) => ({
  x: snapToGrid(point.x, step),
  y: snapToGrid(point.y, step),
});
export const snapSizeToGrid = (value: number, minimum: number) =>
  Math.max(minimum, snapToGrid(Number.isFinite(value) ? value : minimum));
const growToGrid = (value: number) => Math.ceil(value / GRID_SIZE) * GRID_SIZE;
export const terminalOffset = (
  sideLength: number,
  count: number,
  index: number,
) => snapToGrid((sideLength - (count - 1) * GRID_SIZE) / 2) + index * GRID_SIZE;

function fittedSideLength(
  requested: number,
  firstCount: number,
  secondCount: number,
  emptySize: number,
) {
  const count = Math.max(firstCount, secondCount);
  const minimum = count ? (count + 3) * GRID_SIZE : emptySize;
  let length = growToGrid(Math.max(requested, minimum));
  if (count && (length / GRID_SIZE - count + 1) % 2 !== 0) length += GRID_SIZE;
  return length;
}
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
    width: null,
    height: null,
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
  const count = (side: Side) =>
    terminals.filter((terminal) => terminal.side === side).length;
  return {
    width: fittedSideLength(
      device.size?.width ?? device.templateSnapshot.width ?? 0,
      count('top'),
      count('bottom'),
      180,
    ),
    height: fittedSideLength(
      device.size?.height ?? device.templateSnapshot.height ?? 0,
      count('left'),
      count('right'),
      MIN_DEVICE_HEIGHT,
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
