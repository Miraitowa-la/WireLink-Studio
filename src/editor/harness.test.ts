import { expect, test } from 'vitest';
import {
  createEmptyProject,
  parseProjectFile,
  serializeProjectFile,
} from '../model/project';
import {
  autoMatchHarness,
  createHarnessConnection,
  installHarnessPresets,
} from './harness';
import { harnessRows, inspectProject, terminalRows } from './inspection';

function spiProject() {
  const project = installHarnessPresets(createEmptyProject());
  const template = project.harnessLibrary.find(
    (item) => item.name === 'SPI-4',
  )!;
  const deviceTemplate = {
    id: 'board',
    name: '板卡',
    category: '',
    width: 240,
    height: 160,
    appearance: { kind: 'default' as const },
    terminals: template.conductors.map((conductor, order) => ({
      id: conductor.id,
      label: conductor.name,
      typeId: conductor.terminalTypeId,
      side: 'right' as const,
      order,
      maxConnections: 1,
    })),
  };
  project.devices = ['主控板', '传感器板'].map((name, index) => ({
    id: `d${index}`,
    name,
    position: { x: index * 400, y: 0 },
    templateSnapshot: deviceTemplate,
  }));
  return { project, template };
}

test('SPI preset creates four real wires and persists a collapsed harness', () => {
  const { project, template } = spiProject();
  const mappings = autoMatchHarness(project, template, 'd0', 'd1');
  expect(mappings).toHaveLength(4);
  const next = createHarnessConnection(
    project,
    template,
    'd0',
    'd1',
    mappings,
    {
      name: 'SPI 通信',
      number: 'SPI-1',
      note: '',
      cableModel: '',
      shielded: false,
    },
  );
  expect(next.harnesses).toHaveLength(1);
  expect(next.harnesses[0].collapsed).toBe(true);
  expect(next.wires).toHaveLength(4);
  expect(new Set(next.wires.map((wire) => wire.harnessId)).size).toBe(1);
  expect(terminalRows(next)).toHaveLength(8);
  expect(harnessRows(next)).toHaveLength(4);
  expect(harnessRows(next).every((row) => row.status === '正常')).toBe(true);
  expect(inspectProject(next)).toHaveLength(0);
  expect(parseProjectFile(serializeProjectFile(next)).harnesses[0].number).toBe(
    'SPI-1',
  );
});

test('harness creation checks missing mappings and connection capacity before commit', () => {
  const { project, template } = spiProject();
  const mappings = autoMatchHarness(project, template, 'd0', 'd1');
  const details = {
    name: 'SPI',
    number: '',
    note: '',
    cableModel: '',
    shielded: false,
  };
  expect(() =>
    createHarnessConnection(
      project,
      template,
      'd0',
      'd1',
      mappings.slice(1),
      details,
    ),
  ).toThrow('尚未匹配');
  const first = createHarnessConnection(
    project,
    template,
    'd0',
    'd1',
    mappings,
    details,
  );
  expect(() =>
    createHarnessConnection(first, template, 'd0', 'd1', mappings, details),
  ).toThrow('已经连接');
  expect(project.wires).toHaveLength(0);
  expect(project.harnesses).toHaveLength(0);
});
