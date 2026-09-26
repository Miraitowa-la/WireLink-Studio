import { expect, test } from 'vitest';
import {
  createEmptyProject,
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
} from './device';
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
  expect(getDeviceSize(device)).toEqual({ width: 240, height: 120 });
  expect(device.position).toEqual({ x: 30, y: 30 });
  expect(device.note).toBe('默认说明');
  source.name = '后来修改的模板';
  expect(device.templateSnapshot.name).toBe('控制器');
});

test('device dimensions and every corner align to the 30-unit grid', () => {
  const fresh = createDeviceTemplate();
  expect(fresh.width % GRID_SIZE).toBe(0);
  expect(fresh.height % GRID_SIZE).toBe(0);
  const position = snapPointToGrid({ x: -16, y: 44 });
  expect(position).toEqual({ x: -30, y: 30 });
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
