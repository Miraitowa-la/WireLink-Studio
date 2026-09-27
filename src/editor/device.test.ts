import { expect, test } from 'vitest';
import {
  createEmptyProject,
  parseProjectFile,
  serializeProjectFile,
  type DeviceInstance,
  type DeviceTemplate,
} from '../model/project';
import {
  addDevice,
  createDeviceTemplate,
  getDeviceSize,
  GRID_SIZE,
  reorderTerminals,
  snapPointToGrid,
  snapSizeToGrid,
  terminalOffset,
} from './device';
import { terminalPoint } from './harnessGeometry';
const template: DeviceTemplate = {
  id: 'controller',
  name: '控制器',
  category: '控制',
  width: 100,
  height: 100,
  appearance: { kind: 'default' },
  terminals: [
    {
      id: 't1',
      label: 'T1',
      typeId: 'signal',
      side: 'top',
      order: 0,
      maxConnections: 1,
    },
    {
      id: 't2',
      label: 'T2',
      typeId: 'signal',
      side: 'top',
      order: 1,
      maxConnections: 1,
    },
    {
      id: 't3',
      label: 'T3',
      typeId: 'signal',
      side: 'left',
      order: 0,
      maxConnections: null,
    },
  ],
  note: '默认说明',
};

test('reorders one side without changing the other side', () => {
  const reordered = reorderTerminals(template.terminals, 'top', 't2', 't1');
  expect(
    reordered
      .filter((terminal) => terminal.side === 'top')
      .sort((a, b) => a.order - b.order)
      .map((terminal) => terminal.id),
  ).toEqual(['t2', 't1']);
  expect(reordered.find((terminal) => terminal.id === 't3')).toEqual(
    template.terminals[2],
  );
});

test('device size grows with terminals and instance keeps a template snapshot', () => {
  const project = createEmptyProject();
  const source = structuredClone(template);
  const next = addDevice(project, source, { x: 20, y: 30 });
  const device: DeviceInstance = next.devices[0];
  expect(getDeviceSize(device)).toEqual({ width: 150, height: 120 });
  expect(device.position).toEqual({ x: 30, y: 30 });
  expect(device.note).toBe('默认说明');
  source.name = '后来修改的模板';
  expect(device.templateSnapshot.name).toBe('控制器');
});

test('device dimensions and every corner align to the 30-unit grid', () => {
  const fresh = createDeviceTemplate();
  expect(fresh.width).toBeNull();
  expect(fresh.height).toBeNull();
  const position = snapPointToGrid({ x: -16, y: 44 });
  expect(position).toEqual({ x: -30, y: 30 });
  expect(snapPointToGrid({ x: 22, y: 38 }, GRID_SIZE / 2)).toEqual({
    x: 15,
    y: 45,
  });
  expect(snapSizeToGrid(251, 180)).toBe(240);
  const device = addDevice(createEmptyProject(), fresh, position).devices[0];
  const size = getDeviceSize(device);
  for (const coordinate of [
    device.position.x,
    device.position.y,
    device.position.x + size.width,
    device.position.y + size.height,
  ])
    expect(Math.abs(coordinate % GRID_SIZE)).toBe(0);
});

test('terminals are centered on grid points with 30-unit spacing and at least 60-unit end margins', () => {
  const fourSides = structuredClone(template);
  fourSides.width = 240;
  fourSides.height = 180;
  fourSides.terminals = ['top', 'right', 'bottom', 'left'].flatMap((side) =>
    [0, 1].map((order) => ({
      ...template.terminals[0],
      id: `${side}-${order}`,
      side: side as 'top' | 'right' | 'bottom' | 'left',
      order,
    })),
  );
  const project = addDevice(createEmptyProject(), fourSides, { x: 30, y: 60 });
  const device = project.devices[0];
  const { width, height } = getDeviceSize(device);
  expect({ width, height }).toEqual({ width: 270, height: 210 });
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const points = [0, 1].map((order) =>
      terminalPoint(project, {
        deviceId: device.id,
        terminalId: `${side}-${order}`,
      })!,
    );
    const axis = side === 'top' || side === 'bottom' ? 'x' : 'y';
    expect(points[1][axis] - points[0][axis]).toBe(GRID_SIZE);
    const center = device.position[axis] + (axis === 'x' ? width : height) / 2;
    expect((points[0][axis] + points[1][axis]) / 2).toBe(center);
    expect(points[0][axis] % GRID_SIZE).toBe(0);
    expect(points[1][axis] % GRID_SIZE).toBe(0);
    expect(points[0][axis] - device.position[axis]).toBeGreaterThanOrEqual(60);
    expect(
      device.position[axis] + (axis === 'x' ? width : height) - points[1][axis],
    ).toBeGreaterThanOrEqual(60);
    expect(terminalOffset(axis === 'x' ? width : height, 2, 0)).toBe(
      points[0][axis] - device.position[axis],
    );
  }
});

test('automatic dimensions fit terminal counts with 60-unit margins', () => {
  const automatic = { ...template, width: null, height: null };
  const device = addDevice(createEmptyProject(), automatic, { x: 0, y: 0 })
    .devices[0];
  expect(getDeviceSize(device)).toEqual({ width: 150, height: 120 });
  const project = { ...createEmptyProject(), devices: [device] };
  expect(
    terminalPoint(project, { deviceId: device.id, terminalId: 't1' }),
  ).toEqual({ x: 60, y: 0 });
  expect(
    terminalPoint(project, { deviceId: device.id, terminalId: 't2' }),
  ).toEqual({ x: 90, y: 0 });
  expect(
    terminalPoint(project, { deviceId: device.id, terminalId: 't3' }),
  ).toEqual({ x: 0, y: 60 });
});

test('opposite sides with different terminal-count parity use the nearest grid-aligned center', () => {
  const mixed = structuredClone(template);
  mixed.width = null;
  mixed.terminals.push({
    ...mixed.terminals[0],
    id: 't4',
    side: 'bottom',
    order: 0,
  });
  const project = addDevice(createEmptyProject(), mixed, { x: 0, y: 0 });
  const device = project.devices[0];
  expect(getDeviceSize(device).width).toBe(150);
  const bottom = terminalPoint(project, {
    deviceId: device.id,
    terminalId: 't4',
  })!;
  expect(bottom.x % GRID_SIZE).toBe(0);
  expect(bottom.x).toBeGreaterThanOrEqual(60);
  expect(getDeviceSize(device).width - bottom.x).toBeGreaterThanOrEqual(60);
});

test('automatic dimensions survive project serialization and explicit dimensions remain preferred', () => {
  const automatic = createDeviceTemplate();
  const project = addDevice(createEmptyProject(), automatic, { x: 0, y: 0 });
  expect(getDeviceSize(project.devices[0])).toEqual({
    width: 180,
    height: 120,
  });
  expect(project.devices[0].templateSnapshot.width).toBeNull();
  expect(
    parseProjectFile(serializeProjectFile(project)).devices[0].templateSnapshot
      .width,
  ).toBeNull();
  const explicit = { ...automatic, width: 300, height: 210 };
  expect(
    getDeviceSize(addDevice(project, explicit, { x: 0, y: 0 }).devices[1]),
  ).toEqual({
    width: 300,
    height: 210,
  });
});
