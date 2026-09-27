import { expect, test } from 'vitest';
import { createEmptyProject } from '../model/project';
import { buildCanvasEdges } from './CanvasFlowElements';
import { relatedObjects } from './selectionFocus';

function project() {
  const result = createEmptyProject('关系');
  const template = {
    id: 't',
    name: '设备',
    category: '',
    width: 180,
    height: 180,
    appearance: { kind: 'default' as const },
    terminals: [
      {
        id: 'p',
        label: 'P',
        typeId: 't',
        side: 'right' as const,
        order: 0,
        maxConnections: 9,
      },
    ],
  };
  result.devices = ['A', 'B', 'C'].map((id, index) => ({
    id,
    name: id,
    position: { x: index * 300, y: 0 },
    templateSnapshot: template,
  }));
  result.wires = [
    {
      id: 'AB1',
      name: 'AB1',
      source: { deviceId: 'A', terminalId: 'p' },
      target: { deviceId: 'B', terminalId: 'p' },
      harnessId: 'H',
      color: '#ff0000',
    },
    {
      id: 'AB2',
      name: 'AB2',
      source: { deviceId: 'B', terminalId: 'p' },
      target: { deviceId: 'A', terminalId: 'p' },
      harnessId: 'H',
      color: '#00ff00',
    },
    {
      id: 'BC1',
      name: 'BC1',
      source: { deviceId: 'B', terminalId: 'p' },
      target: { deviceId: 'C', terminalId: 'p' },
      color: '#0000ff',
    },
    {
      id: 'BC2',
      name: 'BC2',
      source: { deviceId: 'B', terminalId: 'p' },
      target: { deviceId: 'C', terminalId: 'p' },
      color: '#ff00ff',
    },
  ];
  result.harnesses = [
    {
      id: 'H',
      name: 'H',
      number: 'H',
      collapsed: true,
      color: '#ff9900',
      route: {
        sourceDeviceId: 'A',
        targetDeviceId: 'B',
        sourceJunction: { x: 210, y: 90 },
        targetJunction: { x: 270, y: 90 },
        trunkPoints: [],
        branches: ['AB1', 'AB2'].map((wireId) => ({
          wireId,
          sourcePoints: [],
          targetPoints: [],
        })),
      },
    },
  ];
  return result;
}

test('selection only follows one direct connection and preserves direction', () => {
  const data = project();
  const device = relatedObjects(data, { kind: 'device', id: 'A' })!;
  expect([...device.devices]).toEqual(['A', 'B']);
  expect([...device.wires]).toEqual(['AB1', 'AB2']);
  expect([...device.harnesses]).toEqual(['H']);
  const wire = relatedObjects(data, { kind: 'wire', id: 'AB1' })!;
  expect([...wire.wires]).toEqual(['AB1']);
  expect([...wire.devices]).toEqual(['A', 'B']);
  const harness = relatedObjects(data, { kind: 'harness', id: 'H' })!;
  expect([...harness.wires]).toEqual(['AB1', 'AB2']);
  expect([...harness.devices]).toEqual(['A', 'B']);
});

test('collapsed harness represents selected hidden conductor; overlapping muted wires stay opaque', () => {
  const data = project();
  const focus = relatedObjects(data, { kind: 'wire', id: 'AB1' })!;
  const edges = buildCanvasEdges(data, 'AB1', [], null, null, focus);
  expect(edges.map((edge) => edge.id)).not.toContain('AB1');
  expect(edges.find((edge) => edge.id === 'harness:H')?.zIndex).toBe(2);
  const muted = edges.filter((edge) => edge.id.startsWith('BC'));
  expect(muted).toHaveLength(2);
  expect(muted.map((edge) => edge.style?.stroke)).toEqual([
    '#cbd9e6',
    '#cbd9e6',
  ]);
  expect(
    muted.every(
      (edge) => edge.style?.opacity === undefined && edge.zIndex === 0,
    ),
  ).toBe(true);
  expect(data.harnesses[0].collapsed).toBe(true);
});
