import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { flushSync } from 'react-dom';
import DeviceCanvas, { TEMPLATE_DRAG_TYPE } from './editor/DeviceCanvas';
import { exportDiagram, renderPrintPages } from './editor/diagramExport';
import InspectionPanel from './editor/InspectionPanel';
import type { ValidationIssue } from './editor/inspection';
import { addWire } from './editor/wire';
import {
  addDevice,
  createDeviceTemplate,
  createTerminalType,
  getDeviceSize,
  GRID_SIZE,
  MIN_DEVICE_HEIGHT,
  MIN_DEVICE_WIDTH,
  snapPointToGrid,
  snapSizeToGrid,
} from './editor/device';
import { TemplateEditor, TypeEditor } from './editor/LibraryEditors';
import { HarnessTemplateEditor, HarnessWizard } from './editor/HarnessEditors';
import {
  createHarnessConnection,
  createHarnessTemplate,
  installHarnessPresets,
  type ConductorMapping,
} from './editor/harness';
import { pruneAssets } from './editor/assets';
import {
  hasFilePicker,
  isPickerCancel,
  openProjectWithPicker,
  readProjectFile,
  saveProjectFile,
  type ProjectFileHandle,
} from './editor/projectFiles';
import {
  createEmptyProject,
  deviceTemplateSchema,
  terminalTypeSchema,
  type DeviceInstance,
  type DeviceTemplate,
  type ImageAsset,
  type HarnessTemplate,
  type HarnessConnection,
  type Project,
  type TerminalType,
  type Wire,
  type WireEndpoint,
} from './model/project';

type Editor =
  | { kind: 'type'; value: TerminalType }
  | { kind: 'template'; value: DeviceTemplate }
  | { kind: 'harness-template'; value: HarnessTemplate }
  | { kind: 'harness-wizard' };
type Status = { kind: 'info' | 'error'; text: string } | null;

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('未命名工程');
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedHarnessId, setSelectedHarnessId] = useState<string | null>(
    null,
  );
  const [focusTarget, setFocusTarget] = useState<{
    kind: 'device' | 'wire';
    id: string;
  } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [printSvg, setPrintSvg] = useState('');
  const fileHandle = useRef<ProjectFileHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const exportMenu = useRef<HTMLDetailsElement | null>(null);
  const projectRef = useRef<Project | null>(null);
  const savedProject = useRef<Project | null>(null);
  const projectSession = useRef(0);
  const history = useRef<{ past: Project[]; future: Project[] }>({
    past: [],
    future: [],
  });
  const saving = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const clearPrint = () => setPrintSvg('');
    window.addEventListener('afterprint', clearPrint);
    return () => window.removeEventListener('afterprint', clearPrint);
  }, []);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        project
      ) {
        event.preventDefault();
        void save();
      } else if ((event.ctrlKey || event.metaKey) && !editing && project) {
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          event.preventDefault();
          if (key === 'y' || event.shiftKey) redo();
          else undo();
        }
      } else if (
        !editing &&
        project &&
        (event.key === 'Delete' || event.key === 'Backspace')
      ) {
        if (selectedHarnessId || selectedWireId || selectedId) {
          event.preventDefault();
          if (selectedHarnessId) deleteSelectedHarness();
          else if (selectedWireId) deleteSelectedWire();
          else deleteSelectedDevice();
        }
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function changeProject(update: (current: Project) => Project) {
    const current = projectRef.current;
    if (!current) return;
    const next = update(current);
    if (next === current) return;
    history.current.past.push(current);
    if (history.current.past.length > 50) history.current.past.shift();
    history.current.future = [];
    projectRef.current = next;
    setProject(next);
    setDirty(next !== savedProject.current);
    setStatus(null);
  }

  function restoreProject(next: Project) {
    projectRef.current = next;
    setProject(next);
    setDirty(next !== savedProject.current);
    setStatus(null);
    setSelectedId((id) =>
      next.devices.some((device) => device.id === id) ? id : null,
    );
    setSelectedWireId((id) =>
      next.wires.some((wire) => wire.id === id) ? id : null,
    );
    setSelectedHarnessId((id) =>
      next.harnesses.some((harness) => harness.id === id) ? id : null,
    );
  }

  function undo() {
    const previous = history.current.past.pop();
    if (!previous || !projectRef.current) return;
    history.current.future.push(projectRef.current);
    restoreProject(previous);
  }

  function redo() {
    const next = history.current.future.pop();
    if (!next || !projectRef.current) return;
    history.current.past.push(projectRef.current);
    restoreProject(next);
  }

  function canReplaceProject() {
    return (
      !dirty || window.confirm('当前工程有未保存的修改，确定放弃并继续吗？')
    );
  }

  function newProject() {
    if (!canReplaceProject()) return;
    const next = createEmptyProject(projectName.trim() || '未命名工程');
    projectRef.current = next;
    savedProject.current = null;
    projectSession.current += 1;
    history.current = { past: [], future: [] };
    setProject(next);
    fileHandle.current = null;
    setDirty(true);
    setSelectedId(null);
    setSelectedWireId(null);
    setSelectedHarnessId(null);
    setFocusTarget(null);
    setStatus({ kind: 'info', text: '空工程已创建，请显式保存到文件' });
  }

  function backToWelcome() {
    if (!canReplaceProject()) return;
    setProject(null);
    projectRef.current = null;
    savedProject.current = null;
    projectSession.current += 1;
    history.current = { past: [], future: [] };
    fileHandle.current = null;
    setDirty(false);
    setSelectedId(null);
    setSelectedWireId(null);
    setSelectedHarnessId(null);
    setFocusTarget(null);
    setStatus(null);
  }

  function acceptProject(next: Project, handle: ProjectFileHandle | null) {
    projectRef.current = next;
    savedProject.current = next;
    projectSession.current += 1;
    history.current = { past: [], future: [] };
    setProject(next);
    setProjectName(next.name);
    fileHandle.current = handle;
    setDirty(false);
    setSelectedId(null);
    setSelectedWireId(null);
    setSelectedHarnessId(null);
    setFocusTarget(null);
    setStatus({ kind: 'info', text: `已打开工程“${next.name}”` });
  }

  async function openProject() {
    if (!canReplaceProject()) return;
    const session = projectSession.current;
    if (!hasFilePicker()) {
      fileInput.current?.click();
      return;
    }
    try {
      const { project: next, handle } = await openProjectWithPicker();
      if (projectSession.current === session) acceptProject(next, handle);
    } catch (error) {
      if (!isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const session = projectSession.current;
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const next = await readProjectFile(file);
      if (projectSession.current === session) acceptProject(next, null);
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function save() {
    const snapshot = projectRef.current;
    if (!snapshot || saving.current) return;
    saving.current = true;
    const session = projectSession.current;
    try {
      const handle = await saveProjectFile(snapshot, fileHandle.current);
      if (projectSession.current !== session) return;
      fileHandle.current = handle;
      savedProject.current = snapshot;
      const changedDuringSave = projectRef.current !== snapshot;
      setDirty(changedDuringSave);
      setStatus({
        kind: 'info',
        text: changedDuringSave
          ? '文件已写入，但期间产生了新修改，请再次保存'
          : fileHandle.current
            ? '工程已保存'
            : '工程文件已下载',
      });
    } catch (error) {
      if (projectSession.current === session && !isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    } finally {
      saving.current = false;
    }
  }

  async function exportCurrent(format: 'json' | 'svg' | 'png' | 'html') {
    exportMenu.current?.removeAttribute('open');
    const snapshot = projectRef.current;
    if (!snapshot) return;
    try {
      await exportDiagram(snapshot, format);
      setStatus({ kind: 'info', text: `${format.toUpperCase()} 文件已导出` });
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  function printCurrent() {
    exportMenu.current?.removeAttribute('open');
    const snapshot = projectRef.current;
    if (!snapshot) return;
    try {
      flushSync(() => setPrintSvg(renderPrintPages(snapshot)));
      window.print();
      setStatus({
        kind: 'info',
        text: snapshot.harnesses.length
          ? '已准备折叠总览与展开明细，可在打印对话框中保存为 PDF'
          : '可在打印对话框中选择“保存为 PDF”',
      });
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  function saveType(value: TerminalType) {
    if (!editor) return;
    if (!terminalTypeSchema.safeParse(value).success) {
      setStatus({
        kind: 'error',
        text: '端子类型信息无效，请检查名称和兼容类型',
      });
      return;
    }
    changeProject((current) => ({
      ...current,
      terminalTypes: upsert(current.terminalTypes, value),
    }));
    setEditor(null);
  }

  function saveTemplate(value: DeviceTemplate, asset?: ImageAsset) {
    if (!editor) return;
    if (!deviceTemplateSchema.safeParse(value).success) {
      setStatus({ kind: 'error', text: '设备模板信息无效，请检查尺寸和端子' });
      return;
    }
    changeProject((current) =>
      pruneAssets({
        ...current,
        deviceLibrary: upsert(current.deviceLibrary, value),
        assets: asset ? [...current.assets, asset] : current.assets,
      }),
    );
    setEditor(null);
  }

  function saveHarnessTemplate(value: HarnessTemplate) {
    changeProject((current) => ({
      ...current,
      harnessLibrary: upsert(current.harnessLibrary, value),
    }));
    setEditor(null);
  }

  function createHarness(
    template: HarnessTemplate,
    sourceId: string,
    targetId: string,
    mappings: ConductorMapping[],
    details: {
      name: string;
      number: string;
      note: string;
      cableModel: string;
      shielded: boolean;
    },
  ) {
    const current = projectRef.current;
    if (!current) return '工程不存在';
    try {
      const next = createHarnessConnection(
        current,
        template,
        sourceId,
        targetId,
        mappings,
        details,
      );
      changeProject(() => next);
      setEditor(null);
      setSelectedId(null);
      setSelectedWireId(null);
      setSelectedHarnessId(next.harnesses.at(-1)!.id);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  function updateHarness(id: string, patch: Partial<HarnessConnection>) {
    changeProject((current) => ({
      ...current,
      harnesses: current.harnesses.map((harness) =>
        harness.id === id ? { ...harness, ...patch } : harness,
      ),
    }));
  }

  function deleteSelectedHarness() {
    if (!selectedHarnessId || !window.confirm('删除该线束及所有芯线？')) return;
    changeProject((current) => ({
      ...current,
      harnesses: current.harnesses.filter(
        (item) => item.id !== selectedHarnessId,
      ),
      wires: current.wires.filter(
        (item) => item.harnessId !== selectedHarnessId,
      ),
    }));
    setSelectedHarnessId(null);
  }

  function deleteType(type: TerminalType) {
    if (!project) return;
    const referenced =
      project.deviceLibrary.some((template) =>
        template.terminals.some((terminal) => terminal.typeId === type.id),
      ) ||
      project.devices.some((device) =>
        device.templateSnapshot.terminals.some(
          (terminal) => terminal.typeId === type.id,
        ),
      ) ||
      project.harnessLibrary.some((template) =>
        template.conductors.some(
          (conductor) => conductor.terminalTypeId === type.id,
        ),
      ) ||
      project.harnesses.some((harness) =>
        harness.templateSnapshot.conductors.some(
          (conductor) => conductor.terminalTypeId === type.id,
        ),
      );
    if (referenced) {
      setStatus({
        kind: 'error',
        text: `端子类型“${type.name}”仍被设备或线束引用，不能删除`,
      });
      return;
    }
    if (!window.confirm(`删除端子类型“${type.name}”？`)) return;
    changeProject((current) => ({
      ...current,
      terminalTypes: current.terminalTypes.filter(
        (item) => item.id !== type.id,
      ),
    }));
  }

  function deleteTemplate(template: DeviceTemplate) {
    if (!project) return;
    const references = project.devices.filter(
      (device) => device.templateId === template.id,
    ).length;
    if (references > 0) {
      setStatus({
        kind: 'error',
        text: `模板“${template.name}”被 ${references} 个设备实例引用，不能删除`,
      });
      return;
    }
    if (!window.confirm(`删除设备模板“${template.name}”？`)) return;
    changeProject((current) =>
      pruneAssets({
        ...current,
        deviceLibrary: current.deviceLibrary.filter(
          (item) => item.id !== template.id,
        ),
      }),
    );
  }

  function placeDevice(
    templateId: string,
    position?: { x: number; y: number },
  ) {
    if (!project) return;
    const template = project.deviceLibrary.find(
      (item) => item.id === templateId,
    );
    if (!template) return;
    const index = project.devices.length;
    changeProject((current) =>
      addDevice(
        current,
        template,
        position ?? {
          x: 90 + (index % 3) * 330,
          y: 90 + Math.floor(index / 3) * 240,
        },
      ),
    );
  }

  function updateDevice(id: string, patch: Partial<DeviceInstance>) {
    changeProject((current) => ({
      ...current,
      devices: current.devices.map((device) =>
        device.id === id ? { ...device, ...patch } : device,
      ),
    }));
  }

  function updateDeviceSize(
    device: DeviceInstance,
    dimension: 'width' | 'height',
    raw: number,
    input: HTMLInputElement,
  ) {
    const current = getDeviceSize(device);
    const next = getDeviceSize({
      ...device,
      size: {
        ...current,
        [dimension]: snapSizeToGrid(
          raw,
          dimension === 'width' ? MIN_DEVICE_WIDTH : MIN_DEVICE_HEIGHT,
        ),
      },
    });
    input.value = String(next[dimension]);
    if (next[dimension] !== current[dimension])
      updateDevice(device.id, { size: next });
  }

  function connectTerminals(source: WireEndpoint, target: WireEndpoint) {
    const current = projectRef.current;
    if (!current) return;
    try {
      const next = addWire(current, source, target);
      changeProject(() => next);
      setSelectedId(null);
      setSelectedHarnessId(null);
      setSelectedWireId(next.wires.at(-1)!.id);
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  function updateWire(id: string, patch: Partial<Wire>) {
    changeProject((current) => ({
      ...current,
      wires: current.wires.map((wire) =>
        wire.id === id ? { ...wire, ...patch } : wire,
      ),
    }));
  }

  function deleteSelectedDevice() {
    if (
      !project ||
      !selectedId ||
      !window.confirm('删除选中设备及其所有关联导线和线束？')
    )
      return;
    changeProject((current) => {
      const removedWires = current.wires.filter(
        (wire) =>
          wire.source.deviceId === selectedId ||
          wire.target.deviceId === selectedId,
      );
      const removedHarnesses = new Set(
        removedWires
          .map((wire) => wire.harnessId)
          .filter((id): id is string => !!id),
      );
      return pruneAssets({
        ...current,
        devices: current.devices.filter((device) => device.id !== selectedId),
        wires: current.wires.filter(
          (wire) =>
            !removedWires.includes(wire) &&
            !removedHarnesses.has(wire.harnessId ?? ''),
        ),
        harnesses: current.harnesses.filter(
          (harness) => !removedHarnesses.has(harness.id),
        ),
      });
    });
    setSelectedId(null);
    setSelectedWireId(null);
  }

  function deleteSelectedWire() {
    if (!selectedWireId || !window.confirm('删除这条导线？')) return;
    changeProject((current) => ({
      ...current,
      wires: current.wires.filter((wire) => wire.id !== selectedWireId),
    }));
    setSelectedWireId(null);
  }

  function selectIssue(issue: ValidationIssue) {
    if (issue.wireId) {
      locateWire(issue.wireId);
    } else if (issue.deviceId) {
      setSelectedId(issue.deviceId);
      setSelectedWireId(null);
      setSelectedHarnessId(null);
      setFocusTarget({ kind: 'device', id: issue.deviceId });
    }
  }

  function locateWire(id: string) {
    const wire = projectRef.current?.wires.find((item) => item.id === id);
    if (
      wire?.harnessId &&
      projectRef.current?.harnesses.some(
        (harness) => harness.id === wire.harnessId && harness.collapsed,
      )
    ) {
      changeProject((current) => ({
        ...current,
        harnesses: current.harnesses.map((harness) =>
          harness.id === wire.harnessId
            ? { ...harness, collapsed: false }
            : harness,
        ),
      }));
    }
    setSelectedWireId(id);
    setSelectedId(null);
    setSelectedHarnessId(null);
    setFocusTarget({ kind: 'wire', id });
  }

  const currentTypes = project?.terminalTypes ?? [];
  const currentTemplates = project?.deviceLibrary ?? [];
  const selectedDevice = project?.devices.find(
    (device) => device.id === selectedId,
  );
  const selectedWire = project?.wires.find(
    (wire) => wire.id === selectedWireId,
  );
  const selectedHarness = project?.harnesses.find(
    (harness) => harness.id === selectedHarnessId,
  );
  const fileInputElement = (
    <input
      ref={fileInput}
      type="file"
      accept=".wlproj,application/json"
      hidden
      onChange={onFileSelected}
      aria-label="选择工程文件"
    />
  );

  if (!project)
    return (
      <main className="welcome-screen">
        {fileInputElement}
        <div className="welcome-card">
          <div className="brand-mark">WL</div>
          <p className="eyebrow">工业设备接线设计</p>
          <h1>WireLink Studio</h1>
          <p className="welcome-description">
            在一张画布上整理设备、四边端子与真实接线关系。
          </p>
          <label className="welcome-name">
            工程名称
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          <div className="welcome-actions">
            <button type="button" className="primary" onClick={newProject}>
              新建工程
            </button>
            <button type="button" onClick={() => void openProject()}>
              打开工程
            </button>
          </div>
          <p className="hint">
            工程保存在您选择的本机文件中。新建工程从空画布开始。
          </p>
          {status && (
            <p
              role={status.kind === 'error' ? 'alert' : 'status'}
              className={`status status-${status.kind}`}
            >
              {status.text}
            </p>
          )}
        </div>
      </main>
    );

  return (
    <main className="editor-shell">
      {fileInputElement}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mini">WL</span>
          <strong>WireLink Studio</strong>
        </div>
        <div className="project-title">
          <input
            aria-label="工程名称"
            value={project.name}
            onChange={(event) =>
              changeProject((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <span className="dirty-indicator">{dirty ? '未保存' : '已保存'}</span>
        </div>
        <nav className="toolbar-actions" aria-label="工程操作">
          <button
            type="button"
            disabled={history.current.past.length === 0}
            onClick={undo}
            title="Ctrl+Z"
          >
            撤销
          </button>
          <button
            type="button"
            disabled={history.current.future.length === 0}
            onClick={redo}
            title="Ctrl+Y / Ctrl+Shift+Z"
          >
            重做
          </button>
          <button type="button" onClick={backToWelcome}>
            新建
          </button>
          <button type="button" onClick={() => void openProject()}>
            打开
          </button>
          <button type="button" className="primary" onClick={() => void save()}>
            保存
          </button>
          <details className="export-menu" ref={exportMenu}>
            <summary>导出</summary>
            <div className="export-options">
              <button
                type="button"
                aria-label="导出工程 JSON"
                onClick={() => void exportCurrent('json')}
              >
                工程 JSON
              </button>
              <button
                type="button"
                aria-label="导出 SVG 图纸"
                onClick={() => void exportCurrent('svg')}
              >
                SVG 图纸
              </button>
              <button
                type="button"
                aria-label="导出 PNG 图片"
                onClick={() => void exportCurrent('png')}
              >
                PNG 图片
              </button>
              <button
                type="button"
                aria-label="导出离线 HTML 查看页"
                onClick={() => void exportCurrent('html')}
              >
                离线 HTML 查看页
              </button>
              <button
                type="button"
                aria-label="打印图纸或保存为 PDF"
                onClick={printCurrent}
              >
                打印 / PDF
              </button>
            </div>
          </details>
        </nav>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="资料库">
          <div className="sidebar-heading">
            <h2>资料库</h2>
            <p>端子、设备与线束模板</p>
          </div>
          <section className="library-section">
            <div className="section-heading">
              <h3>端子类型</h3>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: 'type',
                    value: createTerminalType(),
                  })
                }
              >
                新增
              </button>
            </div>
            {currentTypes.length === 0 && (
              <p className="empty-hint">尚无端子类型</p>
            )}
            {currentTypes.map((type) => (
              <div key={type.id} className="library-item">
                <span
                  className="color-dot"
                  style={{ backgroundColor: type.color }}
                />
                <span className="library-item-name" title={type.name}>
                  {type.name}
                </span>
                <button
                  type="button"
                  aria-label={`编辑端子类型 ${type.name}`}
                  onClick={() => setEditor({ kind: 'type', value: type })}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="danger-text"
                  aria-label={`删除端子类型 ${type.name}`}
                  onClick={() => deleteType(type)}
                >
                  ×
                </button>
              </div>
            ))}
          </section>
          <section className="library-section">
            <div className="section-heading">
              <h3>设备模板</h3>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: 'template',
                    value: createDeviceTemplate(),
                  })
                }
              >
                新增
              </button>
            </div>
            {currentTemplates.length === 0 && (
              <p className="empty-hint">尚无设备模板</p>
            )}
            {currentTemplates.map((template) => (
              <div
                key={template.id}
                className="template-item"
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(TEMPLATE_DRAG_TYPE, template.id)
                }
              >
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    {template.category || '未分类'} ·{' '}
                    {template.terminals.length} 个端子
                  </small>
                </div>
                <div className="template-actions">
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        kind: 'template',
                        value: template,
                      })
                    }
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => placeDevice(template.id)}
                  >
                    放入画布
                  </button>
                  <button
                    type="button"
                    className="danger-text"
                    aria-label={`删除模板 ${template.name}`}
                    onClick={() => deleteTemplate(template)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </section>
          <section className="library-section">
            <div className="section-heading">
              <h3>线束模板</h3>
              <button
                type="button"
                onClick={() =>
                  setEditor({
                    kind: 'harness-template',
                    value: createHarnessTemplate(project.terminalTypes[0]?.id),
                  })
                }
                disabled={!project.terminalTypes.length}
              >
                新增
              </button>
            </div>
            <button
              type="button"
              onClick={() => changeProject(installHarnessPresets)}
            >
              添加 SPI-4 / RS485-2 预设
            </button>
            {project.harnessLibrary.map((template) => (
              <div key={template.id} className="library-item">
                <span
                  className="color-dot"
                  style={{ backgroundColor: template.color }}
                />
                <span className="library-item-name">
                  {template.name} · {template.conductors.length} 芯
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditor({ kind: 'harness-template', value: template })
                  }
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="danger-text"
                  onClick={() => {
                    if (
                      project.harnesses.some(
                        (item) => item.templateId === template.id,
                      )
                    ) {
                      setStatus({
                        kind: 'error',
                        text: '该线束模板仍被线束引用',
                      });
                      return;
                    }
                    if (window.confirm(`删除线束模板“${template.name}”？`))
                      changeProject((current) => ({
                        ...current,
                        harnessLibrary: current.harnessLibrary.filter(
                          (item) => item.id !== template.id,
                        ),
                      }));
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </section>
          {project.harnesses.length > 0 && (
            <section className="library-section">
              <div className="section-heading">
                <h3>画布线束</h3>
              </div>
              {project.harnesses.map((harness) => (
                <button
                  key={harness.id}
                  type="button"
                  className="table-link"
                  onClick={() => {
                    setSelectedId(null);
                    setSelectedWireId(null);
                    setSelectedHarnessId(harness.id);
                    setFocusTarget(null);
                  }}
                >
                  {harness.number || harness.name} ·{' '}
                  {harness.collapsed ? '已折叠' : '已展开'}
                </button>
              ))}
            </section>
          )}
        </aside>

        <section className="canvas-panel" aria-label="接线画布">
          <div className="canvas-heading">
            <span>接线画布</span>
            <span>
              {project.devices.length} 台设备 · {project.wires.length} 条导线 ·{' '}
              {project.harnesses.length} 个线束
            </span>
            <button
              type="button"
              disabled={
                project.devices.length < 2 ||
                project.harnessLibrary.length === 0
              }
              onClick={() => setEditor({ kind: 'harness-wizard' })}
            >
              创建线束
            </button>
          </div>
          <DeviceCanvas
            project={project}
            selectedDeviceId={selectedId}
            selectedWireId={selectedWireId}
            selectedHarnessId={selectedHarnessId}
            focusTarget={focusTarget}
            onSelectDevice={(id) => {
              setSelectedId(id);
              setFocusTarget(null);
            }}
            onSelectWire={(id) => {
              setSelectedWireId(id);
              setFocusTarget(null);
            }}
            onSelectHarness={(id) => {
              setSelectedHarnessId(id);
              setFocusTarget(null);
            }}
            onToggleHarness={(id) =>
              updateHarness(id, {
                collapsed: !project.harnesses.find((item) => item.id === id)
                  ?.collapsed,
              })
            }
            onConnect={connectTerminals}
            onAddDevice={placeDevice}
            onMoveDevice={(id, position) =>
              updateDevice(id, { position: snapPointToGrid(position) })
            }
          />
        </section>

        <aside className="properties" aria-label="属性面板">
          <div className="sidebar-heading">
            <h2>属性</h2>
            <p>
              {selectedHarness
                ? '线束'
                : selectedWire
                  ? '普通导线'
                  : selectedDevice
                    ? '设备实例'
                    : '选择画布中的设备、导线或线束'}
            </p>
          </div>
          {selectedHarness ? (
            <div className="properties-body">
              <p className="hint">
                {selectedHarness.templateSnapshot.name} ·{' '}
                {
                  project.wires.filter(
                    (wire) => wire.harnessId === selectedHarness.id,
                  ).length
                }{' '}
                芯
              </p>
              <label>
                名称
                <input
                  value={selectedHarness.name}
                  onChange={(event) =>
                    updateHarness(selectedHarness.id, {
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                编号
                <input
                  value={selectedHarness.number ?? ''}
                  onChange={(event) =>
                    updateHarness(selectedHarness.id, {
                      number: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                线缆型号
                <input
                  value={selectedHarness.cableModel ?? ''}
                  onChange={(event) =>
                    updateHarness(selectedHarness.id, {
                      cableModel: event.target.value,
                    })
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={selectedHarness.shielded ?? false}
                  onChange={(event) =>
                    updateHarness(selectedHarness.id, {
                      shielded: event.target.checked,
                    })
                  }
                />
                屏蔽线缆
              </label>
              <label>
                备注
                <textarea
                  rows={3}
                  value={selectedHarness.note ?? ''}
                  onChange={(event) =>
                    updateHarness(selectedHarness.id, {
                      note: event.target.value,
                    })
                  }
                />
              </label>
              <RoutePointsInput
                key={selectedHarness.id}
                points={selectedHarness.routePoints}
                onSave={(points) =>
                  updateHarness(selectedHarness.id, { routePoints: points })
                }
              />
              <button
                type="button"
                onClick={() =>
                  updateHarness(selectedHarness.id, {
                    collapsed: !selectedHarness.collapsed,
                  })
                }
              >
                {selectedHarness.collapsed ? '展开芯线' : '折叠线束'}
              </button>
              <h3>芯线</h3>
              {project.wires
                .filter((wire) => wire.harnessId === selectedHarness.id)
                .map((wire) => (
                  <button
                    key={wire.id}
                    type="button"
                    className="table-link"
                    onClick={() => {
                      updateHarness(selectedHarness.id, { collapsed: false });
                      setSelectedHarnessId(null);
                      setSelectedWireId(wire.id);
                    }}
                  >
                    {wire.name || wire.conductorId}
                  </button>
                ))}
              <button
                type="button"
                className="danger-text"
                onClick={deleteSelectedHarness}
              >
                删除线束
              </button>
            </div>
          ) : selectedWire ? (
            <div className="properties-body">
              <p className="hint">
                {
                  project.devices.find(
                    (device) => device.id === selectedWire.source.deviceId,
                  )?.name
                }
                {' → '}
                {
                  project.devices.find(
                    (device) => device.id === selectedWire.target.deviceId,
                  )?.name
                }
              </p>
              <label>
                线号
                <input
                  value={selectedWire.number ?? ''}
                  onChange={(event) =>
                    updateWire(selectedWire.id, { number: event.target.value })
                  }
                />
              </label>
              <label>
                名称
                <input
                  value={selectedWire.name ?? ''}
                  onChange={(event) =>
                    updateWire(selectedWire.id, { name: event.target.value })
                  }
                />
              </label>
              <label>
                颜色
                <input
                  type="color"
                  value={selectedWire.color ?? '#64748b'}
                  onChange={(event) =>
                    updateWire(selectedWire.id, { color: event.target.value })
                  }
                />
              </label>
              <label>
                备注
                <textarea
                  rows={4}
                  value={selectedWire.note ?? ''}
                  onChange={(event) =>
                    updateWire(selectedWire.id, { note: event.target.value })
                  }
                />
              </label>
              {selectedWire.harnessId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWireId(null);
                    setSelectedHarnessId(selectedWire.harnessId!);
                  }}
                >
                  选择所属线束：
                  {project.harnesses.find(
                    (item) => item.id === selectedWire.harnessId,
                  )?.name ?? '未知'}
                </button>
              )}
              <button
                type="button"
                className="danger-text"
                onClick={deleteSelectedWire}
              >
                删除导线
              </button>
            </div>
          ) : selectedDevice ? (
            <div className="properties-body">
              <label>
                实例名称
                <input
                  value={selectedDevice.name}
                  onChange={(event) =>
                    updateDevice(selectedDevice.id, {
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                备注
                <textarea
                  rows={4}
                  value={selectedDevice.note ?? ''}
                  onChange={(event) =>
                    updateDevice(selectedDevice.id, {
                      note: event.target.value,
                    })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  宽度（每格 30）
                  <input
                    key={`${selectedDevice.id}:width:${getDeviceSize(selectedDevice).width}`}
                    type="number"
                    min={MIN_DEVICE_WIDTH}
                    step={GRID_SIZE}
                    defaultValue={getDeviceSize(selectedDevice).width}
                    onBlur={(event) =>
                      updateDeviceSize(
                        selectedDevice,
                        'width',
                        Number(event.currentTarget.value),
                        event.currentTarget,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
                <label>
                  高度（每格 30）
                  <input
                    key={`${selectedDevice.id}:height:${getDeviceSize(selectedDevice).height}`}
                    type="number"
                    min={MIN_DEVICE_HEIGHT}
                    step={GRID_SIZE}
                    defaultValue={getDeviceSize(selectedDevice).height}
                    onBlur={(event) =>
                      updateDeviceSize(
                        selectedDevice,
                        'height',
                        Number(event.currentTarget.value),
                        event.currentTarget,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                    }}
                  />
                </label>
              </div>
              <p className="hint">
                位置：{Math.round(selectedDevice.position.x)},{' '}
                {Math.round(selectedDevice.position.y)} · 模板快照：
                {selectedDevice.templateSnapshot.name}
              </p>
              <h3>端子</h3>
              {selectedDevice.templateSnapshot.terminals.length === 0 ? (
                <p className="empty-hint">这个设备没有端子</p>
              ) : (
                selectedDevice.templateSnapshot.terminals.map((terminal) => (
                  <div key={terminal.id} className="property-terminal">
                    <span>{terminal.label}</span>
                    <small>
                      {terminal.side} ·{' '}
                      {project.terminalTypes.find(
                        (type) => type.id === terminal.typeId,
                      )?.name ?? terminal.typeId}
                    </small>
                  </div>
                ))
              )}
              <div className="property-actions">
                <button
                  type="button"
                  onClick={() => {
                    const copy = {
                      ...structuredClone(selectedDevice),
                      id: crypto.randomUUID(),
                      name: `${selectedDevice.name} 副本`,
                      position: {
                        x: selectedDevice.position.x + GRID_SIZE * 2,
                        y: selectedDevice.position.y + GRID_SIZE * 2,
                      },
                    };
                    changeProject((current) => ({
                      ...current,
                      devices: [...current.devices, copy],
                    }));
                    setSelectedId(copy.id);
                  }}
                >
                  复制设备
                </button>
                <button
                  type="button"
                  className="danger-text"
                  onClick={deleteSelectedDevice}
                >
                  删除设备
                </button>
              </div>
            </div>
          ) : (
            <p className="empty-hint properties-placeholder">
              点击设备、导线或线束以编辑属性。
            </p>
          )}
        </aside>
      </div>
      <InspectionPanel
        project={project}
        onSelectIssue={selectIssue}
        onSelectWire={locateWire}
      />
      <footer className="bottom-bar">
        <span>工程版本 {project.version}</span>
        {status && (
          <span
            role={status.kind === 'error' ? 'alert' : 'status'}
            className={`status status-${status.kind}`}
          >
            {status.text}
          </span>
        )}
        <span>Ctrl+S 保存</span>
      </footer>

      {editor?.kind === 'type' && (
        <TypeEditor
          key={editor.value.id}
          initial={editor.value}
          availableTypes={project.terminalTypes}
          onSave={saveType}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'template' && (
        <TemplateEditor
          key={editor.value.id}
          initial={editor.value}
          terminalTypes={project.terminalTypes}
          assets={project.assets}
          onSave={saveTemplate}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'harness-template' && (
        <HarnessTemplateEditor
          key={editor.value.id}
          initial={editor.value}
          types={project.terminalTypes}
          onSave={saveHarnessTemplate}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'harness-wizard' && (
        <HarnessWizard
          project={project}
          onCreate={createHarness}
          onClose={() => setEditor(null)}
        />
      )}
      <div
        className="print-sheet"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: printSvg }}
      />
    </main>
  );
}

function upsert<T extends { id: string }>(items: T[], value: T): T[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => (item.id === value.id ? value : item))
    : [...items, value];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function RoutePointsInput({
  points,
  onSave,
}: {
  points?: { x: number; y: number }[];
  onSave(points?: { x: number; y: number }[]): void;
}) {
  const [text, setText] = useState(
    points?.map((point) => `${point.x},${point.y}`).join('; ') ?? '',
  );
  const [error, setError] = useState('');
  useEffect(
    () =>
      setText(points?.map((point) => `${point.x},${point.y}`).join('; ') ?? ''),
    [points],
  );
  function commit() {
    const chunks = text.trim() ? text.split(/[;\n]+/) : [];
    const parsed = chunks.map((chunk) =>
      chunk.split(',').map((value) => value.trim()),
    );
    if (
      parsed.some(
        (pair) =>
          pair.length !== 2 ||
          pair.some((value) => !value || !Number.isFinite(Number(value))),
      )
    ) {
      setError('路线点格式应为 x,y；多个点用分号分隔');
      return;
    }
    setError('');
    const next = parsed.length
      ? parsed.map(([x, y]) => ({ x: Number(x), y: Number(y) }))
      : undefined;
    if (JSON.stringify(next) !== JSON.stringify(points)) onSave(next);
  }
  return (
    <label>
      路线点（画布坐标，正交连接）
      <textarea
        rows={2}
        placeholder="例如 300,100; 300,260"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
      />
      {error && (
        <span role="alert" className="status-error">
          {error}
        </span>
      )}
    </label>
  );
}
