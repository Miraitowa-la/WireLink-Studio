import { expect, test } from 'vitest';
import { createEmptyProject } from '../model/project';
import { csvForTerminalRows, inspectProject, terminalRows } from './inspection';

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
      templateSnapshot: {
        id: 'ht',
        name: 'SPI',
        color: '#123456',
        conductors: [
          {
            id: 'clk',
            name: 'CLK',
            terminalTypeId: 'signal',
            required: true,
            order: 0,
          },
          {
            id: 'data',
            name: 'DATA',
            terminalTypeId: 'signal',
            required: true,
            order: 1,
          },
        ],
      },
    },
  ];
  for (const wire of project.wires) {
    wire.harnessId = 'h';
    wire.conductorId = 'clk';
  }
  const harnessMessages = inspectProject(project)
    .map((issue) => issue.message)
    .join(' ');
  expect(harnessMessages).toContain('缺少必需芯线');
  expect(harnessMessages).toContain('重复映射');
  expect(harnessMessages).toContain('芯线“CLK”端子类型不匹配');
  expect(terminalRows(project)[0]).toMatchObject({
    harnessNumber: 'H1',
    conductor: 'CLK',
  });
});
