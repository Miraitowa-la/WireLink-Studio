import { expect, test } from 'vitest';
import { createEmptyProject } from '../model/project';
import { renderDiagramSvg, renderViewerHtml } from './diagramExport';

function example() {
  const project = createEmptyProject('SPI <图纸>');
  project.terminalTypes = [
    {
      id: 'signal',
      name: '信号',
      color: '#7c3aed',
      compatibleTypeIds: ['signal'],
    },
  ];
  const conductors = ['MOSI', 'MISO', 'SCLK', 'CS'].map((name, order) => ({
    id: name,
    name,
    terminalTypeId: 'signal',
    required: true,
    order,
  }));
  const template = {
    id: 'board',
    name: '板卡',
    category: '控制器',
    width: 240,
    height: 160,
    appearance: {
      kind: 'image' as const,
      assetId: 'photo',
      imageFit: 'contain' as const,
    },
    terminals: [
      {
        id: 'top',
        label: 'TOP',
        typeId: 'signal',
        side: 'top' as const,
        order: 0,
        maxConnections: 1,
      },
      {
        id: 'bottom',
        label: 'BOTTOM',
        typeId: 'signal',
        side: 'bottom' as const,
        order: 0,
        maxConnections: 1,
      },
      {
        id: 'left',
        label: 'LEFT',
        typeId: 'signal',
        side: 'left' as const,
        order: 0,
        maxConnections: 1,
      },
      ...conductors.map((conductor) => ({
        id: conductor.id,
        label: conductor.name,
        typeId: 'signal',
        side: 'right' as const,
        order: conductor.order,
        maxConnections: 1,
      })),
    ],
  };
  project.devices = [
    {
      id: 'source',
      name: '主控板',
      position: { x: -100, y: 40 },
      templateSnapshot: template,
    },
    {
      id: 'target',
      name: '传感器板',
      position: { x: 400, y: 40 },
      templateSnapshot: { ...template, appearance: { kind: 'default' } },
    },
  ];
  project.assets = [
    {
      id: 'photo',
      name: 'board.png',
      mimeType: 'image/png',
      data: 'data:image/png;base64,aGVsbG8=',
    },
  ];
  project.harnesses = [
    {
      id: 'harness',
      name: 'SPI',
      number: 'SPI-1',
      collapsed: true,
      templateSnapshot: {
        id: 'spi',
        name: 'SPI-4',
        color: '#7c3aed',
        conductors,
      },
      routePoints: [{ x: 260, y: 130 }],
    },
  ];
  project.wires = conductors.map((conductor) => ({
    id: `wire-${conductor.id}`,
    name: conductor.name,
    source: { deviceId: 'source', terminalId: conductor.id },
    target: { deviceId: 'target', terminalId: conductor.id },
    harnessId: 'harness',
    conductorId: conductor.id,
  }));
  return project;
}

test('exports four-side terminals, embedded image and current harness view', () => {
  const project = example();
  const collapsed = renderDiagramSvg(project);
  expect(collapsed.svg).toContain('SPI &lt;图纸&gt;');
  expect(collapsed.svg).toContain('data:image/png;base64,aGVsbG8=');
  for (const label of ['TOP', 'BOTTOM', 'LEFT', 'MOSI'])
    expect(collapsed.svg).toContain(label);
  expect(collapsed.svg).toContain('SPI-1 · 4 芯');
  expect(collapsed.svg.match(/data-kind="harness"/g)).toHaveLength(1);
  expect(collapsed.svg).not.toContain('data-kind="wire"');
  expect(collapsed.svg).toContain('L260 130');
  expect(collapsed.width).toBeGreaterThan(500);
  expect(
    new DOMParser()
      .parseFromString(collapsed.svg, 'image/svg+xml')
      .querySelector('parsererror'),
  ).toBeNull();

  project.harnesses[0].collapsed = false;
  const expanded = renderDiagramSvg(project).svg;
  expect(expanded.match(/data-kind="wire"/g)).toHaveLength(4);
  expect(expanded).not.toContain('data-kind="harness"');
  expect(expanded).toContain('MISO');
});

test('offline viewer includes controls, selection and print layout', () => {
  const html = renderViewerHtml(example());
  expect(html).toContain('适配全图');
  expect(html).toContain('打印 / 保存 PDF');
  expect(html).toContain('data-focus-kind="harness"');
  expect(html).toContain('@media print');
  expect(html).not.toContain('<script src=');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('HTML 查看页缺少脚本');
  expect(() => new Function(script)).not.toThrow();
});
