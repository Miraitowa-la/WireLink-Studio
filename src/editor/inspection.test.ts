import { expect, test } from 'vitest';
import { createEmptyProject } from '../model/project';
import {
  csvForTerminalRows,
  csvForWireRows,
  inspectProject,
  terminalRows,
  wireRows,
} from './inspection';

test('reports imported wiring faults and derives both terminal rows from each wire', () => {
  const project = createEmptyProject();
  project.terminalTypes = [
    {
      id: 'signal',
      name: '信号',
      color: '#123456',
      compatibleTypeIds: ['signal'],
    },
    {
      id: 'other',
      name: '其他',
      color: '#654321',
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
        label: '端子',
        typeId: 'signal',
        side: 'right' as const,
        order: 0,
        maxConnections: 1,
      },
    ],
  };
  project.devices = [
    {
      id: 'a',
      name: 'A',
      templateSnapshot: template,
      position: { x: 0, y: 0 },
    },
    {
      id: 'b',
      name: 'B',
      templateSnapshot: {
        ...template,
        terminals: [{ ...template.terminals[0], typeId: 'other' }],
      },
      position: { x: 300, y: 0 },
    },
  ];
  project.wires = [
    {
      id: 'w1',
      source: { deviceId: 'a', terminalId: 'pin' },
      target: { deviceId: 'b', terminalId: 'pin' },
      number: 'W,"1',
    },
    {
      id: 'w2',
      source: { deviceId: 'b', terminalId: 'pin' },
      target: { deviceId: 'a', terminalId: 'pin' },
      number: 'W,"1',
    },
  ];

  const messages = inspectProject(project)
    .map((issue) => issue.message)
    .join(' ');
  expect(messages).toContain('类型不兼容');
  expect(messages).toContain('重复的端子连接');
  expect(messages).toContain('超过上限');
  expect(messages).toContain('线号重复');
  const rows = terminalRows(project);
  expect(rows).toHaveLength(4);
  expect(wireRows(project)).toHaveLength(2);
  expect(wireRows(project)[0]).toMatchObject({
    sourceDevice: 'A',
    sourceTerminal: '端子',
    targetDevice: 'B',
    targetTerminal: '端子',
  });
  expect(wireRows(project)[1]).toMatchObject({
    sourceDevice: 'B',
    targetDevice: 'A',
  });
  expect(rows[0]).toMatchObject({
    device: 'A',
    terminal: '端子',
    type: '信号',
    connectedTo: 'B / 端子',
  });
  expect(csvForTerminalRows(rows)).toContain('"W,""1"');
  project.wires[0].number = '=1+1';
  expect(csvForTerminalRows(terminalRows(project))).toContain('"\'=1+1"');

  project.wires[1].target = { deviceId: 'missing', terminalId: 'pin' };
  expect(
    inspectProject(project).some((issue) =>
      issue.message.includes('不存在的设备或端子'),
    ),
  ).toBe(true);

  project.wires[1].target = { deviceId: 'a', terminalId: 'pin' };
  project.harnesses = [
    {
      id: 'h',
      name: 'SPI',
      number: 'H1',
      collapsed: true,
      color: '#123456',
    },
  ];
  for (const wire of project.wires) {
    wire.harnessId = 'h';
    wire.name = 'CLK';
    wire.note = '芯线备注';
  }
  const harnessMessages = inspectProject(project)
    .map((issue) => issue.message)
    .join(' ');
  expect(harnessMessages).not.toContain('少于两根芯线');
  expect(terminalRows(project)[0]).toMatchObject({
    harnessNumber: 'H1',
    conductor: 'CLK',
  });
  const wireList = wireRows(project);
  expect(wireList).toHaveLength(2);
  expect(wireList[0]).toMatchObject({
    number: '=1+1',
    name: 'CLK',
    harness: 'SPI',
    harnessNumber: 'H1',
    note: '芯线备注',
  });
  project.harnesses[0].collapsed = false;
  expect(wireRows(project)).toEqual(wireList);
});

test('wire CSV preserves missing endpoint IDs, empty fields and escaped notes', () => {
  const project = createEmptyProject();
  project.wires = [
    {
      id: 'wire',
      source: { deviceId: 'missing-source', terminalId: 'X1' },
      target: { deviceId: 'missing-target', terminalId: 'X2' },
      number: '=1+1',
      note: '备注,含"引号"\n第二行',
    },
  ];
  const rows = wireRows(project);
  expect(rows[0]).toMatchObject({
    sourceDevice: 'missing-source',
    sourceTerminal: 'X1',
    targetDevice: 'missing-target',
    targetTerminal: 'X2',
    harness: '',
    harnessNumber: '',
    name: '',
  });
  const csv = csvForWireRows(rows);
  expect(
    csv.startsWith('\uFEFF"从设备","从端子","到设备","到端子","线号"'),
  ).toBe(true);
  expect(csv).toContain('"\'=1+1"');
  expect(csv).toContain('"备注,含""引号""\n第二行"');
  expect(csvForWireRows([]).split('\r\n')).toHaveLength(1);
  project.wires[0].harnessId = 'missing-harness';
  expect(wireRows(project)[0].harness).toBe('missing-harness');
});
