import type { Project } from '../model/project';
import { escapeXml, renderDiagramSvg, renderPrintPages } from './diagramExport';
import { relatedObjects, type FocusSelection } from './selectionFocus';
export function renderViewerHtml(project: Project): string {
  const { svg } = renderDiagramSvg(project, true);
  const selections: FocusSelection[] = [
    ...project.devices.map((item) => ({
      kind: 'device' as const,
      id: item.id,
    })),
    ...project.wires.map((item) => ({ kind: 'wire' as const, id: item.id })),
    ...project.harnesses.map((item) => ({
      kind: 'harness' as const,
      id: item.id,
    })),
  ];
  const relations = JSON.stringify(
    selections.map((selection) => {
      const related = relatedObjects(project, selection)!;
      return {
        ...selection,
        devices: [...related.devices],
        wires: [...related.wires],
        harnesses: [...related.harnesses],
      };
    }),
  ).replace(/</g, '\\u003c');
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
*{box-sizing:border-box}body{margin:0;font:14px system-ui,"Microsoft YaHei",sans-serif;color:#17334f;background:#eaf0f6}.viewer{display:grid;grid-template-columns:230px minmax(0,1fr);height:100vh}.sidebar{overflow:auto;padding:18px;background:#fff;border-right:1px solid #cbdbe9}.sidebar h1{font-size:17px;margin:0 0 18px}.sidebar h2{font-size:12px;color:#71869a;margin:18px 0 8px}.object-link{display:block;width:100%;padding:6px 8px;margin:2px 0;text-align:left;border:0;border-radius:5px;background:transparent;color:#29445f;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.object-link:hover,.object-link.active{background:#e6f1fc}.harness-item{display:flex;align-items:center;gap:4px}.harness-item .object-link{min-width:0}.harness-toggle{flex:none;border:1px solid #cbdbe9;border-radius:5px;background:#fff;color:#29445f;padding:5px;cursor:pointer;font-size:11px}.stage{display:flex;flex-direction:column;min-width:0}.toolbar{display:flex;gap:8px;align-items:center;padding:10px 14px;background:#fff;border-bottom:1px solid #cbdbe9}.toolbar button{padding:6px 11px;border:1px solid #cbdbe9;border-radius:6px;background:#fff;color:#17334f;cursor:pointer}.hint{margin-left:auto;color:#71869a;font-size:12px}.viewport{flex:1;overflow:hidden;min-height:0}.viewport svg{width:100%;height:100%;touch-action:none;cursor:grab}.viewport svg.dragging{cursor:grabbing}.diagram-object{cursor:pointer}.diagram-object.muted[data-kind="device"]{opacity:.32}.diagram-object.muted[data-kind="wire"]>path:not(.edge-hit),.diagram-object.muted[data-kind="harness"]>path:not(.edge-hit){stroke:#cbd9e6!important}.diagram-object.muted .edge-label text{fill:#8da2b5}.diagram-object.muted .edge-label rect{fill:#f7fafc;stroke:#dce7ef}.edge-hit{cursor:pointer}.print-pages{display:none}@media(max-width:700px){.viewer{grid-template-columns:1fr}.sidebar{max-height:180px;border-right:0;border-bottom:1px solid #cbdbe9}.hint{display:none}}@page{size:A4 landscape;margin:10mm}@media print{body{background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}.viewer{display:none}.print-pages{display:block}.print-page:not(:last-child){break-after:page;page-break-after:always}.print-page h2{margin:0 0 4mm;font-size:16pt}.print-page svg{display:block;width:100%;height:auto;max-height:170mm}}
</style></head><body><div class="viewer"><aside class="sidebar"><h1>${escapeXml(project.name)}</h1><h2>设备</h2>${devices || '<p>无设备</p>'}<h2>导线</h2>${wires || '<p>无导线</p>'}<h2>线束</h2>${harnesses || '<p>无线束</p>'}</aside><main class="stage"><div class="toolbar"><button type="button" id="fit">适配全图</button><button type="button" id="zoom-in">放大</button><button type="button" id="zoom-out">缩小</button><button type="button" id="print">打印 / 保存 PDF</button><span class="hint">拖动画布平移，滚轮缩放；点击对象选中</span></div><div class="viewport">${svg}</div></main></div><div class="print-pages">${renderPrintPages(project)}</div><script>
const svg=document.querySelector('.viewport svg');
const original=svg.getAttribute('viewBox').split(' ').map(Number);
const relations=${relations};
const objects=[...svg.querySelectorAll('.diagram-object')];
const layer=objects[0]?.parentNode;
let view=[...original], selection=null;
function setView(x,y,w,h){view=[x,y,w,h];svg.setAttribute('viewBox',view.join(' '))}
function zoom(scale){const [x,y,w,h]=view;const nw=w*scale,nh=h*scale;setView(x+(w-nw)/2,y+(h-nh)/2,nw,nh)}
function applyFocus(){
  const related=selection&&relations.find(item=>item.kind===selection.kind&&item.id===selection.id);
  const sets=related&&{device:new Set(related.devices),wire:new Set(related.wires),harness:new Set(related.harnesses)};
  for(const node of objects){
    node.classList.toggle('muted',!!sets&&!sets[node.dataset.kind].has(node.dataset.id));
    node.classList.toggle('active',!!selection&&node.dataset.kind===selection.kind&&node.dataset.id===selection.id);
  }
  document.querySelectorAll('.object-link').forEach(item=>item.classList.toggle('active',!!selection&&item.dataset.focusKind===selection.kind&&item.dataset.focusId===selection.id));
  if(layer){
    const edges=objects.filter(node=>node.dataset.kind!=='device');
    const devices=objects.filter(node=>node.dataset.kind==='device');
    const ordered=sets?
      [...edges.filter(node=>node.classList.contains('muted')),...edges.filter(node=>!node.classList.contains('muted')),
       ...devices.filter(node=>node.classList.contains('muted')),...devices.filter(node=>!node.classList.contains('muted'))]:
      objects;
    for(const node of ordered)layer.appendChild(node);
  }
}
function focus(kind,id,center=true){
  const node=objects.find(item=>item.dataset.kind===kind&&item.dataset.id===id);
  if(!node)return;
  selection={kind,id};applyFocus();
  if(!center)return;
  const visible=node.style.display==='none'&&node.dataset.harnessId?
    objects.find(item=>item.dataset.kind==='harness'&&item.dataset.id===node.dataset.harnessId&&item.style.display!=='none'):node;
  if(!visible||visible.style.display==='none')return;
  const box=visible.getBBox();const pad=Math.max(65,Math.max(box.width,box.height)*.4);
  const aspect=svg.clientWidth/Math.max(1,svg.clientHeight);
  let w=Math.max(box.width+pad*2,160),h=Math.max(box.height+pad*2,120);
  if(w/h>aspect)h=w/aspect;else w=h*aspect;
  setView(box.x+box.width/2-w/2,box.y+box.height/2-h/2,w,h);
}
function toggleHarness(id,collapsed){
  const button=[...document.querySelectorAll('.harness-toggle')].find(item=>item.dataset.harnessId===id);
  if(!button)return;
  button.dataset.collapsed=String(collapsed);button.setAttribute('aria-expanded',String(!collapsed));
  button.textContent=collapsed?'展开芯线':'折叠线束';
  for(const node of objects)if(node.dataset.harnessId===id)
    node.style.display=node.dataset.view===(collapsed?'collapsed':'expanded')?'':'none';
  applyFocus();
}
document.querySelectorAll('.harness-toggle').forEach(button=>button.onclick=()=>toggleHarness(button.dataset.harnessId,button.dataset.collapsed!=='true'));
document.getElementById('fit').onclick=()=>setView(...original);
document.getElementById('zoom-in').onclick=()=>zoom(.8);
document.getElementById('zoom-out').onclick=()=>zoom(1.25);
document.getElementById('print').onclick=()=>{setView(...original);window.print()};
document.querySelectorAll('.object-link').forEach(item=>item.onclick=()=>focus(item.dataset.focusKind,item.dataset.focusId));
svg.addEventListener('click',event=>{
  const node=event.target.closest('.diagram-object');
  if(node)focus(node.dataset.kind,node.dataset.id,false);
  else{selection=null;applyFocus()}
});
svg.addEventListener('dblclick',event=>{
  const node=event.target.closest('.diagram-object');const id=node?.dataset.harnessId;
  if(id){const button=[...document.querySelectorAll('.harness-toggle')].find(item=>item.dataset.harnessId===id);toggleHarness(id,button.dataset.collapsed!=='true')}
});
svg.addEventListener('wheel',event=>{event.preventDefault();zoom(event.deltaY<0?.9:1.1)},{passive:false});
let drag=null;
svg.addEventListener('pointerdown',event=>{if(event.target.closest('.diagram-object'))return;drag={x:event.clientX,y:event.clientY,view:[...view]};svg.setPointerCapture(event.pointerId);svg.classList.add('dragging')});
svg.addEventListener('pointermove',event=>{if(!drag)return;const dx=(event.clientX-drag.x)*drag.view[2]/Math.max(1,svg.clientWidth);const dy=(event.clientY-drag.y)*drag.view[3]/Math.max(1,svg.clientHeight);setView(drag.view[0]-dx,drag.view[1]-dy,drag.view[2],drag.view[3])});
svg.addEventListener('pointerup',event=>{if(!drag)return;drag=null;svg.releasePointerCapture(event.pointerId);svg.classList.remove('dragging')});
</script></body></html>`;
}
