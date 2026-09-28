import type { DeviceInstance, Project, Wire } from '../model/project';
import { deviceTerminalLayout, getDeviceSize } from './device';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { labelPoint, wirePath } from './wireGeometry';

type Point = { x: number; y: number };
type Diagram = { svg: string; width: number; height: number };

export const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
const text = (value: string, limit = 28) =>
  escapeXml(value.length > limit ? `${value.slice(0, limit - 1)}…` : value);
const n = (value: number) => Number(value.toFixed(2));

function edgeSvg(
  project: Project,
  wire: Wire,
  kind: 'wire' | 'harness',
  id: string,
  label: string,
  color: string,
  width: number,
  routePoints?: Point[],
  attributes = '',
): string {
  const source = terminalPoint(project, wire.source);
  const target = terminalPoint(project, wire.target);
  if (!source || !target) return '';
  const geometry = wirePath(source, target, routePoints);
  const position = labelPoint(geometry.label, wire.labelOffset);
  const labelMarkup =
    project.viewPreferences?.showLabels === false || !label
      ? ''
      : `<g class="edge-label"><rect x="${n(position.x - Math.min(110, label.length * 4.1 + 10))}" y="${n(position.y - 10)}" width="${n(Math.min(220, label.length * 8.2 + 20))}" height="20" rx="4" fill="#fff" stroke="#dbe4ed"/><text x="${n(position.x)}" y="${n(position.y + 4)}" text-anchor="middle" fill="#29445f" font-size="12">${text(label, 26)}</text></g>`;
  return `<g class="diagram-object" data-kind="${kind}" data-id="${escapeXml(id)}"${attributes}><title>${text(label || id)}</title><path d="${geometry.path}" fill="none" stroke="${escapeXml(color)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/><path d="${geometry.path}" fill="none" stroke="transparent" stroke-width="16" class="edge-hit"/>${labelMarkup}</g>`;
}

function imageData(project: Project, device: DeviceInstance): string | null {
  if (device.templateSnapshot.appearance.kind !== 'image') return null;
  const asset = project.assets.find(
    (item) => item.id === device.templateSnapshot.appearance.assetId,
  );
  if (
    !asset ||
    !/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(asset.data)
  )
    return null;
  return asset.data;
}

function deviceSvg(
  project: Project,
  device: DeviceInstance,
  index: number,
): string {
  const { x, y } = device.position;
  const { width, height } = getDeviceSize(device);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const image = imageData(project, device);
  const imageMarkup = image
    ? `<clipPath id="device-clip-${index}"><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="10"/></clipPath><image href="${escapeXml(image)}" x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" preserveAspectRatio="${device.templateSnapshot.appearance.imageFit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}" clip-path="url(#device-clip-${index})"/>`
    : '';
  const category = device.templateSnapshot.category;
  const labelBgWidth = Math.min(
    width - 24,
    Math.max(70, device.name.length * 14 + 22),
  );
  const labelMarkup = `<rect x="${n(centerX - labelBgWidth / 2)}" y="${n(centerY - (category ? 25 : 15))}" width="${n(labelBgWidth)}" height="${category ? 48 : 30}" rx="5" fill="#ffffffde"/><text x="${n(centerX)}" y="${n(centerY + (category ? -2 : 5))}" text-anchor="middle" font-size="16" font-weight="700" fill="#17334f">${text(device.name, 19)}</text>${category ? `<text x="${n(centerX)}" y="${n(centerY + 16)}" text-anchor="middle" font-size="11" fill="#627b92">${text(category, 22)}</text>` : ''}`;
  const terminals = deviceTerminalLayout(device)
    .map(({ terminal, side, count, point }) => {
      const type = project.terminalTypes.find(
        (item) => item.id === terminal.typeId,
      );
      const labelX =
        side === 'left' ? x + 13 : side === 'right' ? x + width - 13 : point.x;
      const labelY =
        side === 'top'
          ? y + 22
          : side === 'bottom'
            ? y + height - 15
            : point.y + 3;
      const anchor =
        side === 'left' ? 'start' : side === 'right' ? 'end' : 'middle';
      const labelLimit =
        side === 'top' || side === 'bottom' ? (count === 1 ? 11 : 5) : 9;
      return `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="5.5" fill="${escapeXml(type?.color ?? '#64748b')}" stroke="#fff" stroke-width="2"/><text x="${n(labelX)}" y="${n(labelY)}" text-anchor="${anchor}" font-size="10" font-weight="600" fill="#526b83">${text(terminal.label, labelLimit)}</text>`;
    })
    .join('');
  return `<g class="diagram-object" data-kind="device" data-id="${escapeXml(device.id)}"><title>${text(device.name)}</title><rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="10" fill="#fff" stroke="#5c86aa" stroke-width="2"/>${imageMarkup}${labelMarkup}${terminals}</g>`;
}

export function renderDiagramSvg(
  project: Project,
  includeHiddenHarnessViews = false,
): Diagram {
  const xValues = project.devices.flatMap((device) => [
    device.position.x,
    device.position.x + getDeviceSize(device).width,
  ]);
  const yValues = project.devices.flatMap((device) => [
    device.position.y,
    device.position.y + getDeviceSize(device).height,
  ]);
  for (const point of [
    ...project.wires.flatMap((wire) => wire.routePoints ?? []),
    ...project.harnesses.flatMap((harness) =>
      harness.route
        ? [
            harness.route.sourceJunction,
            harness.route.targetJunction,
            ...harness.route.trunkPoints,
            ...harness.route.branches.flatMap((branch) => [
              ...branch.sourcePoints,
              ...branch.targetPoints,
            ]),
          ]
        : [],
    ),
  ]) {
    xValues.push(point.x);
    yValues.push(point.y);
  }
  if (project.viewPreferences?.showLabels !== false) {
    for (const wire of project.wires) {
      if (!wire.labelOffset) continue;
      if (
        !includeHiddenHarnessViews &&
        wire.harnessId &&
        project.harnesses.find((item) => item.id === wire.harnessId)?.collapsed
      )
        continue;
      const source = terminalPoint(project, wire.source);
      const target = terminalPoint(project, wire.target);
      if (!source || !target) continue;
      const point = labelPoint(
        wirePath(source, target, wire.routePoints).label,
        wire.labelOffset,
      );
      xValues.push(point.x - 110, point.x + 110);
      yValues.push(point.y - 10, point.y + 10);
    }
    for (const harness of project.harnesses) {
      if (!harness.labelOffset) continue;
      if (!includeHiddenHarnessViews && !harness.collapsed) continue;
      const geometry = collapsedHarnessGeometry(project, harness.id);
      if (!geometry) continue;
      const point = labelPoint(geometry.label, harness.labelOffset);
      xValues.push(point.x - 110, point.x + 110);
      yValues.push(point.y - 10, point.y + 10);
    }
  }
  const minX = xValues.length ? Math.min(...xValues) : 0;
  const minY = yValues.length ? Math.min(...yValues) : 0;
  const maxX = xValues.length ? Math.max(...xValues) : 800;
  const maxY = yValues.length ? Math.max(...yValues) : 500;
  const width = Math.max(500, maxX - minX + 120);
  const height = Math.max(320, maxY - minY + 135);
  const wires = project.wires
    .filter(
      (wire) =>
        includeHiddenHarnessViews ||
        !wire.harnessId ||
        !project.harnesses.find((harness) => harness.id === wire.harnessId)
          ?.collapsed,
    )
    .map((wire) => {
      return edgeSvg(
        project,
        wire,
        'wire',
        wire.id,
        [wire.number, wire.name].filter(Boolean).join(' · '),
        wire.color || '#64748b',
        wire.harnessId ? 2.5 : 2,
        wire.routePoints,
        includeHiddenHarnessViews && wire.harnessId
          ? ` data-harness-id="${escapeXml(wire.harnessId)}" data-view="expanded"${project.harnesses.find((harness) => harness.id === wire.harnessId)?.collapsed ? ' style="display:none"' : ''}`
          : '',
      );
    })
    .join('');
  const harnesses = project.harnesses
    .filter((harness) => includeHiddenHarnessViews || harness.collapsed)
    .map((harness) => {
      const children = project.wires.filter(
        (wire) => wire.harnessId === harness.id,
      );
      const geometry = collapsedHarnessGeometry(project, harness.id);
      if (!geometry) return '';
      const label = `${harness.number || harness.name} · ${children.length} 芯`;
      const position = labelPoint(geometry.label, harness.labelOffset);
      const labelMarkup =
        project.viewPreferences?.showLabels === false
          ? ''
          : `<g class="edge-label"><rect x="${n(position.x - Math.min(110, label.length * 4.1 + 10))}" y="${n(position.y - 10)}" width="${n(Math.min(220, label.length * 8.2 + 20))}" height="20" rx="4" fill="#fff" stroke="#dbe4ed"/><text x="${n(position.x)}" y="${n(position.y + 4)}" text-anchor="middle" fill="#29445f" font-size="12">${text(label, 26)}</text></g>`;
      const color = escapeXml(harness.color);
      const visibility = includeHiddenHarnessViews
        ? ` data-harness-id="${escapeXml(harness.id)}" data-view="collapsed"${harness.collapsed ? '' : ' style="display:none"'}`
        : '';
      return `<g class="diagram-object" data-kind="harness" data-id="${escapeXml(harness.id)}"${visibility}><title>${text(label)}</title>${geometry.paths
        .slice(1)
        .map(
          (part) =>
            `<path d="${part.path}" fill="none" stroke="${escapeXml(part.color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join(
          '',
        )}<path d="${geometry.trunk}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${geometry.branches} ${geometry.trunk}" fill="none" stroke="transparent" stroke-width="16" class="edge-hit"/>${labelMarkup}</g>`;
    })
    .join('');
  const devices = project.devices
    .map((device, index) => deviceSvg(project, device, index))
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(width)}" height="${n(height)}" viewBox="${n(minX - 60)} ${n(minY - 75)} ${n(width)} ${n(height)}" role="img" aria-label="${escapeXml(project.name)}接线图"><title>${escapeXml(project.name)}</title><rect x="${n(minX - 60)}" y="${n(minY - 75)}" width="${n(width)}" height="${n(height)}" fill="#f7fafc"/><text x="${n(minX)}" y="${n(minY - 37)}" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#17334f">${text(project.name, 60)}</text><g font-family="Arial, sans-serif">${wires}${harnesses}${devices}</g></svg>`;
  return { svg, width, height };
}

export function renderPrintPages(project: Project): string {
  const views = project.harnesses.some((harness) => !!harness.route)
    ? [
        { title: '线束总览（折叠）', collapsed: true },
        { title: '芯线明细（展开）', collapsed: false },
      ]
    : [{ title: '', collapsed: false }];
  return views
    .map(({ title, collapsed }) => {
      const snapshot = {
        ...project,
        harnesses: project.harnesses.map((harness) => ({
          ...harness,
          collapsed: collapsed && !!harness.route,
        })),
      };
      return `<section class="print-page">${title ? `<h2>${title}</h2>` : ''}${renderDiagramSvg(snapshot).svg}</section>`;
    })
    .join('');
}
