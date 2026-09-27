import { expect, test, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import { renderDiagramSvg, renderPrintPages } from './diagramExport';
import { renderViewerHtml } from './diagramViewer';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { deviceTerminalLayout } from './device';
import { wirePath } from './wireGeometry';

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
      color: '#7c3aed',
      route: {
        sourceDeviceId: 'source',
        targetDeviceId: 'target',
        sourceJunction: { x: 170, y: 150 },
        targetJunction: { x: 370, y: 150 },
        trunkPoints: [{ x: 270, y: 120 }],
        branches: conductors.map((conductor) => ({
          wireId: `wire-${conductor.id}`,
          sourcePoints: [],
          targetPoints: [],
        })),
      },
    },
  ];
  project.wires = conductors.map((conductor) => ({
    id: `wire-${conductor.id}`,
    name: conductor.name,
    source: { deviceId: 'source', terminalId: conductor.id },
    target: { deviceId: 'target', terminalId: conductor.id },
    harnessId: 'harness',
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

test('SVG and print terminal centers match the shared layout after moving and resizing a device', () => {
  const project = example();
  const device = project.devices[0];
  device.position = { x: 60, y: 90 };
  device.size = { width: 360, height: 270 };
  const expected = deviceTerminalLayout(device).map(({ point }) => point);
  const readCenters = (svg: Element) =>
    Array.from(
      svg.querySelectorAll('[data-kind="device"][data-id="source"] circle'),
    ).map((circle) => ({
      x: Number(circle.getAttribute('cx')),
      y: Number(circle.getAttribute('cy')),
    }));
  const svg = new DOMParser().parseFromString(
    renderDiagramSvg(project).svg,
    'image/svg+xml',
  ).documentElement;
  expect(readCenters(svg)).toEqual(expected);
  const print = document.createElement('div');
  print.innerHTML = renderPrintPages(project);
  expect(readCenters(print.querySelector('svg')!)).toEqual(expected);
  for (const { terminal, point } of deviceTerminalLayout(device))
    expect(
      terminalPoint(project, { deviceId: device.id, terminalId: terminal.id }),
    ).toEqual(point);
});

test('exports the same manual wire route used by the canvas', () => {
  const project = example();
  project.harnesses[0].collapsed = false;
  const wire = project.wires[0];
  wire.routePoints = [
    { x: 270, y: 90 },
    { x: 270, y: 210 },
  ];
  const geometry = wirePath(
    terminalPoint(project, wire.source)!,
    terminalPoint(project, wire.target)!,
    wire.routePoints,
  );
  const svg = renderDiagramSvg(project).svg;
  expect(svg).toContain(`d="${geometry.path}"`);
  const label = new DOMParser()
    .parseFromString(svg, 'image/svg+xml')
    .querySelector('[data-kind="wire"] .edge-label text')!;
  expect(Number(label.getAttribute('x'))).toBeCloseTo(geometry.label.x, 1);
  expect(Number(label.getAttribute('y')) - 4).toBeCloseTo(geometry.label.y, 1);
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

test('offline viewer focuses one hop, orders related paths, and keeps folded conductors hidden', () => {
  const project = example();
  project.devices.push({
    ...structuredClone(project.devices[1]),
    id: 'third',
    name: '第三设备',
    position: { x: 850, y: 40 },
  });
  for (const id of ['BC1', 'BC2'])
    project.wires.push({
      id,
      name: id,
      source: { deviceId: 'target', terminalId: 'left' },
      target: { deviceId: 'third', terminalId: 'left' },
      color: '#c00',
    });
  const html = renderViewerHtml(project);
  document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)![1];
  const svg = document.querySelector<SVGSVGElement>('.viewport svg')!;
  Object.defineProperty(svg, 'clientWidth', { value: 800 });
  Object.defineProperty(svg, 'clientHeight', { value: 600 });
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    value: () => ({ x: 0, y: 0, width: 100, height: 100 }),
    configurable: true,
  });
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)![1])();
  const object = (kind: string, id: string) =>
    svg.querySelector<SVGGElement>(`[data-kind="${kind}"][data-id="${id}"]`)!;
  document
    .querySelector<HTMLButtonElement>('[data-focus-id="source"]')!
    .click();
  expect(object('device', 'target').classList.contains('muted')).toBe(false);
  expect(object('device', 'third').classList.contains('muted')).toBe(true);
  expect(object('wire', 'BC1').classList.contains('muted')).toBe(true);
  expect(object('wire', 'BC2').classList.contains('muted')).toBe(true);
  expect(object('harness', 'harness').classList.contains('muted')).toBe(false);
  expect(
    object('wire', 'BC1').compareDocumentPosition(
      object('harness', 'harness'),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(html).toContain('stroke:#cbd9e6!important');
  document
    .querySelector<HTMLButtonElement>('[data-focus-id="wire-MOSI"]')!
    .click();
  expect(object('wire', 'wire-MOSI').style.display).toBe('none');
  expect(object('harness', 'harness').style.display).toBe('');
  expect(object('harness', 'harness').classList.contains('muted')).toBe(false);
  object('device', 'third')
    .querySelector('rect')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(object('device', 'source').classList.contains('muted')).toBe(true);
  svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(svg.querySelectorAll('.diagram-object.muted')).toHaveLength(0);
  expect(svg.querySelectorAll('.diagram-object.active')).toHaveLength(0);
  expect(
    object('wire', 'BC1').compareDocumentPosition(
      object('harness', 'harness'),
    ) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
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
  expect(geometry!.branches).toContain('M520 250');
  expect(geometry!.trunk).toContain('L270 120');
  expect(geometry!.branches).not.toContain('NaN');
  expect(
    renderDiagramSvg(project).svg.match(/data-kind="harness"/g),
  ).toHaveLength(1);
});

test('collapsed harness uses explicit route points', () => {
  const project = example();
  const route = project.harnesses[0].route!;
  route.trunkPoints = [{ x: 270, y: 150 }];
  const geometry = collapsedHarnessGeometry(project, 'harness')!;
  expect(geometry.trunk).toContain('L270 150');
  expect(geometry.paths).toHaveLength(9);
});
