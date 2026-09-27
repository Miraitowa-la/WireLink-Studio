import { expect, test } from 'vitest';
import { createEmptyProject, type DeviceInstance } from '../model/project';
import { removeDevice, removeTerminalType } from './projectOperations';

const device = (id: string): DeviceInstance => ({
  id,
  name: id,
  position: { x: 0, y: 0 },
  templateSnapshot: {
    id: `template-${id}`,
    name: id,
    category: '',
    width: 180,
    height: 120,
    appearance: { kind: 'default' },
    terminals: [
      {
        id: 'port',
        label: '端子',
        typeId: 'used',
        side: 'right',
        order: 0,
        maxConnections: 1,
      },
    ],
  },
});

test('removing a device clears connected wires, their harness, and orphaned assets', () => {
  const project = createEmptyProject();
  project.devices = [device('a'), device('b'), device('c')];
  project.devices[0].templateSnapshot.appearance = {
    kind: 'image',
    assetId: 'asset',
  };
  project.assets = [
    {
      id: 'asset',
      name: '图片',
      mimeType: 'image/png',
      data: 'data:image/png;base64,AA==',
    },
  ];
  project.wires = [
    {
      id: 'w1',
      source: { deviceId: 'a', terminalId: 'port' },
      target: { deviceId: 'b', terminalId: 'port' },
      harnessId: 'h',
    },
    {
      id: 'w2',
      source: { deviceId: 'a', terminalId: 'port' },
      target: { deviceId: 'b', terminalId: 'port' },
      harnessId: 'h',
    },
    {
      id: 'w3',
      source: { deviceId: 'b', terminalId: 'port' },
      target: { deviceId: 'c', terminalId: 'port' },
    },
  ];
  project.harnesses = [
    { id: 'h', name: '线束', color: '#123', collapsed: false },
  ];
  expect(removeDevice(project, 'a')).toMatchObject({
    devices: [{ id: 'b' }, { id: 'c' }],
    wires: [{ id: 'w3' }],
    harnesses: [],
    assets: [],
  });
  expect(removeDevice(project, 'missing')).toBe(project);
});

test('removing a terminal type cleans compatibility references and blocks device references', () => {
  const project = createEmptyProject();
  project.terminalTypes = [
    {
      id: 'used',
      name: '使用中',
      color: '#123',
      compatibleTypeIds: ['used', 'unused'],
    },
    {
      id: 'unused',
      name: '未使用',
      color: '#456',
      compatibleTypeIds: ['used', 'unused'],
    },
  ];
  project.devices = [device('a')];
  expect(removeTerminalType(project, 'unused').terminalTypes).toEqual([
    { id: 'used', name: '使用中', color: '#123', compatibleTypeIds: ['used'] },
  ]);
  expect(() => removeTerminalType(project, 'used')).toThrow('仍被设备引用');
  expect(removeTerminalType(project, 'missing')).toBe(project);
});
