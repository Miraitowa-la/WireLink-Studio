import { expect, test } from 'vitest';
import {
  createEmptyProject,
  parseProjectFile,
  serializeProjectFile,
} from '../model/project';
import {
  createHarnessFromWires,
  removeWire,
  routeHarness,
  selectedHarnessWires,
  ungroupHarness,
} from './harness';
import { collapsedHarnessGeometry } from './harnessGeometry';
import { harnessRows, inspectProject, terminalRows } from './inspection';

function projectWithWires() {
  const project = createEmptyProject();
  const template = {
    id: 'board',
    name: '设备',
    category: '',
    width: 180,
    height: 120,
    appearance: { kind: 'default' as const },
    terminals: ['a', 'b'].map((id, order) => ({
      id,
      label: id,
      typeId: 'signal',
      side: 'right' as const,
      order,
      maxConnections: 1,
    })),
  };
  project.terminalTypes = [
    {
      id: 'signal',
      name: '信号',
      color: '#345678',
      compatibleTypeIds: ['signal'],
    },
  ];
  project.devices = [
    {
      id: 'left',
      name: '左设备',
      position: { x: 0, y: 0 },
      templateSnapshot: template,
    },
    {
      id: 'right',
      name: '右设备',
      position: { x: 360, y: 0 },
      templateSnapshot: template,
    },
  ];
  project.wires = [
    {
      id: 'a',
      name: 'A',
      color: '#123456',
      source: { deviceId: 'left', terminalId: 'a' },
      target: { deviceId: 'right', terminalId: 'a' },
      routePoints: [{ x: 210, y: 30 }],
    },
    {
      id: 'b',
      name: 'B',
      color: '#654321',
      source: { deviceId: 'right', terminalId: 'b' },
      target: { deviceId: 'left', terminalId: 'b' },
      routePoints: [{ x: 300, y: 90 }],
    },
  ];
  return project;
}
const details = {
  name: '通信线束',
  number: 'H1',
  color: '#7045e5',
  note: '',
  cableModel: '',
  shielded: false,
};

test('groups existing wires, keeps original paths, and normalizes reverse direction only for display', () => {
  const project = projectWithWires();
  const grouped = createHarnessFromWires(project, ['a', 'b'], details);
  expect(grouped.wires[0].routePoints).toEqual(project.wires[0].routePoints);
  expect(grouped.wires[1].source).toEqual(project.wires[1].source);
  expect(grouped.harnesses[0].collapsed).toBe(false);
  const routed = routeHarness(grouped, grouped.harnesses[0].id, {
    sourceDeviceId: 'left',
    targetDeviceId: 'right',
    sourceJunction: { x: 210, y: 60 },
    targetJunction: { x: 330, y: 60 },
    trunkPoints: [],
    branches: [
      { wireId: 'a', sourcePoints: [], targetPoints: [] },
      { wireId: 'b', sourcePoints: [], targetPoints: [] },
    ],
  });
  expect(routed.harnesses[0].collapsed).toBe(true);
  expect(
    collapsedHarnessGeometry(routed, routed.harnesses[0].id)?.paths,
  ).toHaveLength(5);
  expect(routed.wires[1].source.deviceId).toBe('right');
  expect(terminalRows(routed)).toHaveLength(4);
  expect(harnessRows(routed)).toHaveLength(2);
  expect(inspectProject(routed)).toHaveLength(0);
  expect(parseProjectFile(serializeProjectFile(routed)).harnesses[0].name).toBe(
    '通信线束',
  );
  const ungrouped = ungroupHarness(routed, routed.harnesses[0].id);
  expect(ungrouped.harnesses).toHaveLength(0);
  expect(ungrouped.wires.map((wire) => wire.routePoints)).toEqual(
    project.wires.map((wire) => wire.routePoints),
  );
});

test('rejects invalid selections and dissolves group if one wire remains', () => {
  const project = projectWithWires();
  expect(() => selectedHarnessWires(project, ['a'])).toThrow('至少');
  const grouped = createHarnessFromWires(project, ['a', 'b'], details);
  expect(() => selectedHarnessWires(grouped, ['a', 'b'])).toThrow('已属于');
  const removed = removeWire(grouped, 'a');
  expect(removed.harnesses).toHaveLength(0);
  expect(removed.wires[0].harnessId).toBeUndefined();
});
