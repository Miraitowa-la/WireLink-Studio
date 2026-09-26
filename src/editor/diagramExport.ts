import type { DeviceInstance, Project, Wire } from '../model/project';
import { getDeviceSize, SIDES, terminalOffset } from './device';
import { serializeProjectFile } from '../model/project';
import { safeProjectName } from './projectFiles';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { wirePath } from './wireGeometry';

type Point = { x: number; y: number };
type Diagram = { svg: string; width: number; height: number };

const escapeXml = (value: string): string =>
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
  const labelMarkup =
    project.viewPreferences?.showLabels === false || !label
      ? ''
      : `<g class="edge-label"><rect x="${n(geometry.label.x - Math.min(110, label.length * 4.1 + 10))}" y="${n(geometry.label.y - 10)}" width="${n(Math.min(220, label.length * 8.2 + 20))}" height="20" rx="4" fill="#fff" stroke="#dbe4ed"/><text x="${n(geometry.label.x)}" y="${n(geometry.label.y + 4)}" text-anchor="middle" fill="#29445f" font-size="12">${text(label, 26)}</text></g>`;
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
  const terminals = SIDES.flatMap((side) => {
    const onSide = device.templateSnapshot.terminals
      .filter((terminal) => terminal.side === side)
      .sort((a, b) => a.order - b.order);
    return onSide.map((terminal, order) => {
      const offset = terminalOffset(
        side === 'top' || side === 'bottom' ? width : height,
        onSide.length,
        order,
      );
      const point =
        side === 'top'
          ? { x: x + offset, y }
          : side === 'bottom'
            ? { x: x + offset, y: y + height }
            : side === 'left'
              ? { x, y: y + offset }
              : { x: x + width, y: y + offset };
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
        side === 'top' || side === 'bottom'
          ? onSide.length === 1
            ? 11
            : 5
          : 9;
      return `<circle cx="${n(point.x)}" cy="${n(point.y)}" r="5.5" fill="${escapeXml(type?.color ?? '#64748b')}" stroke="#fff" stroke-width="2"/><text x="${n(labelX)}" y="${n(labelY)}" text-anchor="${anchor}" font-size="10" font-weight="600" fill="#526b83">${text(terminal.label, labelLimit)}</text>`;
    });
  }).join('');
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
      const labelMarkup =
        project.viewPreferences?.showLabels === false
          ? ''
          : `<g class="edge-label"><rect x="${n(geometry.label.x - Math.min(110, label.length * 4.1 + 10))}" y="${n(geometry.label.y - 10)}" width="${n(Math.min(220, label.length * 8.2 + 20))}" height="20" rx="4" fill="#fff" stroke="#dbe4ed"/><text x="${n(geometry.label.x)}" y="${n(geometry.label.y + 4)}" text-anchor="middle" fill="#29445f" font-size="12">${text(label, 26)}</text></g>`;
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

export function renderViewerHtml(project: Project): string {
  const { svg } = renderDiagramSvg(project, true);
  const item = (kind: string, id: string, label: string) =>
    `<button type="button" class="object-link" data-focus-kind="${kind}" data-focus-id="${escapeXml(id)}">${escapeXml(label)}</button>`;
  const devices = project.devices
    .map((device) => item('device', device.id, device.name))
    .join('');
  const wires = project.wires
    .map((wire) => {
      return item(
        'wire',
        wire.id,
        [wire.number, wire.name].filter(Boolean).join(' · ') || wire.id,
      );
    })
    .join('');
  const harnesses = project.harnesses
    .map(
      (harness) =>
        `<div class="harness-item">${harness.route ? item('harness', harness.id, `${harness.number || harness.name} · ${project.wires.filter((wire) => wire.harnessId === harness.id).length} 芯`) : `<span>${escapeXml(harness.number || harness.name)} · 待走线</span>`}${harness.route ? `<button type="button" class="harness-toggle" data-harness-id="${escapeXml(harness.id)}" data-collapsed="${harness.collapsed}" aria-expanded="${!harness.collapsed}">${harness.collapsed ? '展开芯线' : '折叠线束'}</button>` : ''}</div>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(project.name)} · WireLink 图纸</title><style>
*{box-sizing:border-box}body{margin:0;font:14px system-ui,"Microsoft YaHei",sans-serif;color:#17334f;background:#eaf0f6}.viewer{display:grid;grid-template-columns:230px minmax(0,1fr);height:100vh}.sidebar{overflow:auto;padding:18px;background:#fff;border-right:1px solid #cbdbe9}.sidebar h1{font-size:17px;margin:0 0 18px}.sidebar h2{font-size:12px;color:#71869a;margin:18px 0 8px}.object-link{display:block;width:100%;padding:6px 8px;margin:2px 0;text-align:left;border:0;border-radius:5px;background:transparent;color:#29445f;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.object-link:hover,.object-link.active{background:#e6f1fc}.harness-item{display:flex;align-items:center;gap:4px}.harness-item .object-link{min-width:0}.harness-toggle{flex:none;border:1px solid #cbdbe9;border-radius:5px;background:#fff;color:#29445f;padding:5px;cursor:pointer;font-size:11px}.stage{display:flex;flex-direction:column;min-width:0}.toolbar{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #cbdbe9}.toolbar button{padding:6px 11px;border:1px solid #cbdbe9;border-radius:6px;background:#fff;color:#17334f;cursor:pointer}.hint{margin-left:auto;color:#71869a;font-size:12px}.viewport{flex:1;overflow:hidden;min-height:0}.viewport svg{width:100%;height:100%;touch-action:none;cursor:grab}.viewport svg.dragging{cursor:grabbing}.diagram-object{cursor:pointer}.diagram-object.active>rect:nth-child(2),.diagram-object.active>path:not(.edge-hit){stroke:#e8590c!important}.edge-hit{cursor:pointer}.print-pages{display:none}@media(max-width:700px){.viewer{grid-template-columns:1fr}.sidebar{max-height:180px;border-right:0;border-bottom:1px solid #cbdbe9}.hint{display:none}}@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.viewer{display:none}.print-pages{display:block}.print-page:not(:last-child){break-after:page;page-break-after:always}.print-page h2{margin:0 0 4mm;font-size:16pt}.print-page svg{display:block;width:100%;height:auto;max-height:170mm}}
</style></head><body><div class="viewer"><aside class="sidebar"><h1>${escapeXml(project.name)}</h1><h2>设备</h2>${devices || '<p>无设备</p>'}<h2>导线</h2>${wires || '<p>无导线</p>'}<h2>线束</h2>${harnesses || '<p>无线束</p>'}</aside><main class="stage"><div class="toolbar"><button type="button" id="fit">适配全图</button><button type="button" id="zoom-in">放大</button><button type="button" id="zoom-out">缩小</button><button type="button" id="print">打印 / 保存 PDF</button><span class="hint">拖动画布平移，滚轮缩放；点击对象选中</span></div><div class="viewport">${svg}</div></main></div><div class="print-pages">${renderPrintPages(project)}</div><script>
const svg=document.querySelector('.viewport svg');const original=svg.getAttribute('viewBox').split(' ').map(Number);let view=[...original];function setView(x,y,w,h){view=[x,y,w,h];svg.setAttribute('viewBox',view.join(' '))}function zoom(scale){const [x,y,w,h]=view;const nw=w*scale,nh=h*scale;setView(x+(w-nw)/2,y+(h-nh)/2,nw,nh)}function focus(kind,id,center=true){const node=[...svg.querySelectorAll('.diagram-object')].find(item=>item.dataset.kind===kind&&item.dataset.id===id);if(!node)return;if(node.style.display==='none'&&node.dataset.harnessId)toggleHarness(node.dataset.harnessId,kind==='harness');document.querySelectorAll('.active').forEach(item=>item.classList.remove('active'));node.classList.add('active');document.querySelectorAll('.object-link').forEach(item=>{if(item.dataset.focusKind===kind&&item.dataset.focusId===id)item.classList.add('active')});if(!center)return;const box=node.getBBox();const pad=Math.max(65,Math.max(box.width,box.height)*.4);const aspect=svg.clientWidth/Math.max(1,svg.clientHeight);let w=Math.max(box.width+pad*2,160),h=Math.max(box.height+pad*2,120);if(w/h>aspect)h=w/aspect;else w=h*aspect;setView(box.x+box.width/2-w/2,box.y+box.height/2-h/2,w,h)}
function toggleHarness(id,collapsed){const button=[...document.querySelectorAll('.harness-toggle')].find(item=>item.dataset.harnessId===id);if(!button)return;button.dataset.collapsed=String(collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.textContent=collapsed?'展开芯线':'折叠线束';svg.querySelectorAll('.diagram-object[data-harness-id]').forEach(node=>{if(node.dataset.harnessId===id)node.style.display=node.dataset.view===(collapsed?'collapsed':'expanded')?'':'none'});document.querySelectorAll('.active').forEach(item=>item.classList.remove('active'))}
document.querySelectorAll('.harness-toggle').forEach(button=>button.onclick=()=>toggleHarness(button.dataset.harnessId,button.dataset.collapsed!=='true'));
document.getElementById('fit').onclick=()=>setView(...original);document.getElementById('zoom-in').onclick=()=>zoom(.8);document.getElementById('zoom-out').onclick=()=>zoom(1.25);document.getElementById('print').onclick=()=>{setView(...original);window.print()};document.querySelectorAll('.object-link').forEach(item=>item.onclick=()=>focus(item.dataset.focusKind,item.dataset.focusId));svg.addEventListener('click',event=>{const node=event.target.closest('.diagram-object');if(node)focus(node.dataset.kind,node.dataset.id,false)});svg.addEventListener('dblclick',event=>{const node=event.target.closest('.diagram-object');const id=node?.dataset.harnessId;if(id){const button=[...document.querySelectorAll('.harness-toggle')].find(item=>item.dataset.harnessId===id);toggleHarness(id,button.dataset.collapsed!=='true')}});svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY<0?.9:1.1)},{passive:false});let drag=null;svg.addEventListener('pointerdown',event=>{if(event.target.closest('.diagram-object'))return;drag={x:event.clientX,y:event.clientY,view:[...view]};svg.setPointerCapture(event.pointerId);svg.classList.add('dragging')});svg.addEventListener('pointermove',event=>{if(!drag)return;const dx=(event.clientX-drag.x)*drag.view[2]/Math.max(1,svg.clientWidth);const dy=(event.clientY-drag.y)*drag.view[3]/Math.max(1,svg.clientHeight);setView(drag.view[0]-dx,drag.view[1]-dy,drag.view[2],drag.view[3])});svg.addEventListener('pointerup',()=>{if(!drag)return;drag=null;svg.releasePointerCapture(event.pointerId);svg.classList.remove('dragging')});
</script></body></html>`;
}

function download(content: Blob, filename: string): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDiagram(
  project: Project,
  format: 'json' | 'svg' | 'png' | 'html',
): Promise<void> {
  const name = safeProjectName(project.name);
  if (format === 'json') {
    download(
      new Blob([serializeProjectFile(project)], {
        type: 'application/json;charset=utf-8',
      }),
      `${name}.json`,
    );
    return;
  }
  if (format === 'html') {
    download(
      new Blob([renderViewerHtml(project)], {
        type: 'text/html;charset=utf-8',
      }),
      `${name}.html`,
    );
    return;
  }
  const { svg, width, height } = renderDiagramSvg(project);
  if (format === 'svg') {
    download(
      new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      `${name}.svg`,
    );
    return;
  }
  const url = URL.createObjectURL(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const result = new Image();
      result.onload = () => resolve(result);
      result.onerror = () => reject(new Error('SVG 图纸无法转换为 PNG'));
      result.src = url;
    });
    const scale = Math.min(2, 8192 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成 PNG');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result ? resolve(result) : reject(new Error('PNG 编码失败')),
        'image/png',
      ),
    );
    download(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
