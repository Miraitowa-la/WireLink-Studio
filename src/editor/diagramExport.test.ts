import { expect, test, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import {
  renderDiagramSvg,
  renderPrintPages,
  renderViewerHtml,
} from './diagramExport';
import { collapsedHarnessGeometry } from './harnessGeometry';

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
  expect(collapsed.svg).toContain('L270 120');
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
  expect(html.match(/class="print-page"/g)).toHaveLength(2);
  expect(html).not.toContain('<script src=');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('HTML 查看页缺少脚本');
  expect(() => new Function(script)).not.toThrow();
});

test('print layout includes collapsed overview and expanded conductor detail', () => {
  const container = document.createElement('div');
  container.innerHTML = renderPrintPages(example());
  const pages = container.querySelectorAll('.print-page');
  expect(pages).toHaveLength(2);
  expect(pages[0].textContent).toContain('线束总览（折叠）');
  expect(pages[0].querySelectorAll('[data-kind="harness"]')).toHaveLength(1);
  expect(pages[0].querySelectorAll('[data-kind="wire"]')).toHaveLength(0);
  expect(pages[1].textContent).toContain('芯线明细（展开）');
  expect(pages[1].querySelectorAll('[data-kind="wire"]')).toHaveLength(4);
});

test('offline viewer selects canvas objects and switches harness views', () => {
  const html = renderViewerHtml(example());
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)![1];
  const svg = document.querySelector('svg')!;
  Object.defineProperty(svg, 'clientWidth', { value: 800 });
  Object.defineProperty(svg, 'clientHeight', { value: 600 });
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    configurable: true,
  });
  const capture = vi.fn();
  svg.setPointerCapture = capture;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  new Function(script)();
  const initialView = svg.getAttribute('viewBox');
  const harness = svg.querySelector<SVGGElement>('[data-kind="harness"]')!;
  const wire = svg.querySelector<SVGGElement>('[data-kind="wire"]')!;
  const device = svg.querySelector<SVGGElement>('[data-kind="device"]')!;
  const toggle = document.querySelector<HTMLButtonElement>('.harness-toggle')!;
  expect(wire.style.display).toBe('none');
  harness
    .querySelector('.edge-hit')!
    .dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(capture).not.toHaveBeenCalled();
  harness
    .querySelector('.edge-hit')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(harness.classList.contains('active')).toBe(true);
  expect(svg.getAttribute('viewBox')).toBe(initialView);
  device
    .querySelector('rect')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(device.classList.contains('active')).toBe(true);
  document
    .querySelector<HTMLButtonElement>('[data-focus-kind="device"]')!
    .click();
  expect(svg.getAttribute('viewBox')).not.toBe(initialView);
  toggle.click();
  expect(harness.style.display).toBe('none');
  expect(wire.style.display).toBe('');
  wire
    .querySelector('.edge-hit')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(wire.classList.contains('active')).toBe(true);
  wire
    .querySelector('.edge-hit')!
    .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(toggle.dataset.collapsed).toBe('true');
  document.body.innerHTML = '';
});

test('collapsed harness keeps every terminal connected, including mixed sides', () => {
  const project = example();
  project.wires[1].source.terminalId = 'top';
  project.wires[1].target.terminalId = 'bottom';
  const geometry = collapsedHarnessGeometry(project, 'harness');
  expect(geometry).not.toBeNull();
  expect(geometry!.branches.match(/M/g)).toHaveLength(8);
  expect(geometry!.branches).toContain('M20 40');
  expect(geometry!.branches).toContain('M520 280');
  expect(geometry!.trunk).toContain('L270 120');
  expect(geometry!.branches).not.toContain('NaN');
  expect(
    renderDiagramSvg(project).svg.match(/data-kind="harness"/g),
  ).toHaveLength(1);
});

test('collapsed harness label sits on a long trunk and clears short gaps', () => {
  const project = example();
  project.harnesses[0].routePoints = [];
  const wide = collapsedHarnessGeometry(project, 'harness')!;
  expect(wide.label.y).toBe(150);
  project.devices[1].position.x = 170;
  const narrow = collapsedHarnessGeometry(project, 'harness')!;
  expect(narrow.label.y).toBeLessThan(project.devices[0].position.y);
});

test('collapsed harness junctions and bends sit on grid points', () => {
  const project = example();
  project.devices[0].position = { x: -90, y: 30 };
  project.devices[1].position = { x: 390, y: 30 };
  project.wires[1].source.terminalId = 'top';
  project.wires[1].target.terminalId = 'bottom';
  project.harnesses[0].routePoints = [{ x: 271, y: 137 }];
  const geometry = collapsedHarnessGeometry(project, 'harness')!;
  for (const coordinate of `${geometry.branches} ${geometry.trunk}`.matchAll(
    /[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
  )) {
    expect(Number(coordinate[1]) % 30).toBe(0);
    expect(Number(coordinate[2]) % 30).toBe(0);
  }
  expect(geometry.trunk).toContain('L270 150');
});
