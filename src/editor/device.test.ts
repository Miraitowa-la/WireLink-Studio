import { expect, test } from 'vitest';
import {
  createEmptyProject,
  type DeviceInstance,
  type DeviceTemplate,
  type TerminalType,
} from '../model/project';
import {
  addDevice,
  copyTemplateToProject,
  getDeviceSize,
  reorderTerminals,
} from './device';

const type: TerminalType = {
  id: 'signal',
  name: '信号',
  color: '#123456',
  compatibleTypeIds: ['signal'],
};
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
  expect(getDeviceSize(device)).toEqual({ width: 228, height: 120 });
  expect(device.note).toBe('默认说明');
  source.name = '后来修改的模板';
  expect(device.templateSnapshot.name).toBe('控制器');
});

test('copying a public template brings missing terminal types into the project', () => {
  const result = copyTemplateToProject(createEmptyProject(), template, [type]);
  expect(result.deviceLibrary).toHaveLength(1);
  expect(result.terminalTypes).toEqual([type]);
});
