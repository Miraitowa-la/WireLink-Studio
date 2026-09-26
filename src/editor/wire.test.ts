import { expect, test } from 'vitest';
import {
  createEmptyProject,
  type Project,
  type WireEndpoint,
} from '../model/project';
import { addWire } from './wire';

const a: WireEndpoint = { deviceId: 'a', terminalId: 'pin' };
const b: WireEndpoint = { deviceId: 'b', terminalId: 'pin' };
const c: WireEndpoint = { deviceId: 'c', terminalId: 'pin' };

function sampleProject(): Project {
  const project = createEmptyProject();
  project.terminalTypes = [
    {
      id: 'signal',
      name: '信号',
      color: '#123456',
      compatibleTypeIds: ['signal'],
    },
  ];
  const template = {
    id: 'template',
    name: '设备',
    category: '',
    width: 180,
    height: 120,
    appearance: { kind: 'default' as const },
    terminals: [
      {
        id: 'pin',
        label: 'P1',
        typeId: 'signal',
        side: 'right' as const,
        order: 0,
        maxConnections: 1,
      },
    ],
  };
  project.devices = ['a', 'b', 'c'].map((id, index) => ({
    id,
    name: id,
    templateSnapshot: template,
    position: { x: index * 250, y: 0 },
  }));
  return project;
}

test('adds a wire between compatible terminals and blocks duplicate and capacity overflow', () => {
  const connected = addWire(sampleProject(), a, b);
  expect(connected.wires).toHaveLength(1);
  expect(connected.wires[0]).toMatchObject({
    source: a,
    target: b,
    name: '导线 1',
    color: '#123456',
  });
  expect(() => addWire(connected, b, a)).toThrow('已经连接');
  expect(() => addWire(connected, a, c)).toThrow('连接上限');
});

test('assigns the next available default wire name', () => {
  const project = sampleProject();
  project.devices.push({
    ...project.devices[2],
    id: 'd',
    name: 'd',
  });
  project.wires = [
    {
      id: 'existing',
      source: a,
      target: b,
      name: '导线 1',
    },
  ];
  expect(
    addWire(project, c, { deviceId: 'd', terminalId: 'pin' }).wires.at(-1)
      ?.name,
  ).toBe('导线 2');
});

test('requires mutual type compatibility and valid endpoints', () => {
  const project = sampleProject();
  project.terminalTypes.push({
    id: 'other',
    name: '其他',
    color: '#abcdef',
    compatibleTypeIds: ['signal'],
  });
  project.devices[1].templateSnapshot = {
    ...project.devices[1].templateSnapshot,
    terminals: [
      { ...project.devices[1].templateSnapshot.terminals[0], typeId: 'other' },
    ],
  };
  expect(() => addWire(project, a, b)).toThrow('不兼容');
  expect(() =>
    addWire(project, a, { deviceId: 'missing', terminalId: 'pin' }),
  ).toThrow('不存在');
  expect(() => addWire(project, a, a)).toThrow('自身');
});
