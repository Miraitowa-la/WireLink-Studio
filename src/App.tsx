import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import InspectionPanel from './editor/InspectionPanel';
import type { ValidationIssue } from './editor/inspection';
import { addWire } from './editor/wire';
import {
  addDevice,
  getDeviceSize,
  GRID_SIZE,
  MIN_DEVICE_HEIGHT,
  MIN_DEVICE_WIDTH,
  snapPointToGrid,
  snapSizeToGrid,
} from './editor/device';
import { TemplateEditor, TypeEditor } from './editor/LibraryEditors';
import { HarnessCreateDialog } from './editor/HarnessEditors';
import {
  createHarnessFromWires,
  removeWire,
  routeHarness,
  selectedHarnessWires,
  ungroupHarness,
} from './editor/harness';
import { pruneAssets } from './editor/assets';
import {
  deviceTemplateSchema,
  terminalTypeSchema,
  type DeviceInstance,
  type DeviceTemplate,
  type ImageAsset,
  type HarnessConnection,
  type HarnessRoute,
  type TerminalType,
  type Wire,
  type WireEndpoint,
} from './model/project';
import { errorMessage, useProjectSession } from './useProjectSession';
import { LibrarySidebar, type Editor } from './editor/LibrarySidebar';
import { PropertiesPanel } from './editor/PropertiesPanel';

const DeviceCanvas = lazy(() => import('./editor/DeviceCanvas'));

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedHarnessId, setSelectedHarnessId] = useState<string | null>(
    null,
  );
  const [routingHarnessId, setRoutingHarnessId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    kind: 'device' | 'wire';
    id: string;
  } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [printSvg, setPrintSvg] = useState('');
  const exportMenu = useRef<HTMLDetailsElement | null>(null);
  const {
    project,
    projectName,
    setProjectName,
    dirty,
    status,
    setStatus,
    fileInput,
    projectRef,
    history,
    changeProject,
    undo,
    redo,
    newProject,
    backToWelcome,
    openProject,
    onFileSelected,
    save,
  } = useProjectSession(
    (next) => {
      setRoutingHarnessId(null);
      setSelectedId((id) =>
        next.devices.some((device) => device.id === id) ? id : null,
      );
      setSelectedWireId((id) =>
        next.wires.some((wire) => wire.id === id) ? id : null,
      );
      setSelectedHarnessId((id) =>
        next.harnesses.some((harness) => harness.id === id) ? id : null,
      );
    },
    () => {
      setRoutingHarnessId(null);
      setSelectedId(null);
      setSelectedWireId(null);
      setSelectedHarnessId(null);
      setFocusTarget(null);
    },
  );
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
        !routingHarnessId &&
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

  async function exportCurrent(format: 'json' | 'svg' | 'png' | 'html') {
    exportMenu.current?.removeAttribute('open');
    const snapshot = projectRef.current;
    if (!snapshot) return;
    try {
      const { exportDiagram } = await import('./editor/diagramExport');
      await exportDiagram(snapshot, format);
      setStatus({ kind: 'info', text: `${format.toUpperCase()} 文件已导出` });
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function printCurrent() {
    exportMenu.current?.removeAttribute('open');
    const snapshot = projectRef.current;
    if (!snapshot) return;
    try {
      const { renderPrintPages } = await import('./editor/diagramExport');
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

  function startHarnessCreation(wireIds: string[]) {
    const current = projectRef.current;
    if (!current) return;
    try {
      selectedHarnessWires(current, wireIds);
      setEditor({ kind: 'harness-create', wireIds });
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  function createHarness(
    details: Pick<
      HarnessConnection,
      'name' | 'number' | 'color' | 'note' | 'cableModel' | 'shielded'
    >,
  ): string | null {
    const current = projectRef.current;
    if (!current || editor?.kind !== 'harness-create') return '未选择导线';
    try {
      const next = createHarnessFromWires(current, editor.wireIds, details);
      const id = next.harnesses.at(-1)!.id;
      changeProject(() => next);
      setEditor(null);
      setSelectedId(null);
      setSelectedWireId(null);
      setSelectedHarnessId(id);
      setRoutingHarnessId(id);
      return null;
    } catch (error) {
      return errorMessage(error);
    }
  }

  function finishHarnessRoute(id: string, route: HarnessRoute) {
    try {
      changeProject((current) => routeHarness(current, id, route));
      setRoutingHarnessId(null);
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
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
    if (
      !selectedHarnessId ||
      !window.confirm('解除该线束分组？原有导线将保留。')
    )
      return;
    changeProject((current) => ungroupHarness(current, selectedHarnessId));
    setRoutingHarnessId(null);
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
      );
    if (referenced) {
      setStatus({
        kind: 'error',
        text: `端子类型“${type.name}”仍被设备引用，不能删除`,
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

  function connectTerminals(
    source: WireEndpoint,
    target: WireEndpoint,
    routePoints: { x: number; y: number }[],
  ): boolean {
    const current = projectRef.current;
    if (!current) return false;
    try {
      const next = addWire(current, source, target);
      const wire = next.wires.at(-1)!;
      changeProject(() => ({
        ...next,
        wires: [...next.wires.slice(0, -1), { ...wire, routePoints }],
      }));
      setSelectedId(null);
      setSelectedHarnessId(null);
      setSelectedWireId(wire.id);
      return true;
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
      return false;
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

  function deleteWire(id: string) {
    if (!window.confirm('删除这条导线？')) return;
    changeProject((current) => removeWire(current, id));
    setSelectedWireId(null);
  }

  function deleteSelectedWire() {
    if (selectedWireId) deleteWire(selectedWireId);
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
        <LibrarySidebar
          project={project}
          selectedHarnessId={selectedHarnessId}
          setEditor={setEditor}
          deleteType={deleteType}
          deleteTemplate={deleteTemplate}
          placeDevice={placeDevice}
          onSelectHarness={(id) => {
            setSelectedId(null);
            setSelectedWireId(null);
            setSelectedHarnessId(id);
            setFocusTarget(null);
          }}
        />
        <section className="canvas-panel" aria-label="接线画布">
          <div className="canvas-heading">
            <span>接线画布</span>
            <span>
              {project.devices.length} 台设备 · {project.wires.length} 条导线 ·{' '}
              {project.harnesses.length} 个线束
            </span>
            <span className="hint">Ctrl + 点击导线多选，右键创建线束</span>
          </div>
          <Suspense
            fallback={<div className="canvas-empty">正在加载画布…</div>}
          >
            <DeviceCanvas
              project={project}
              selectedDeviceId={selectedId}
              selectedWireId={selectedWireId}
              selectedHarnessId={selectedHarnessId}
              routingHarnessId={routingHarnessId}
              onCreateHarness={startHarnessCreation}
              onCompleteHarnessRoute={finishHarnessRoute}
              onCancelHarnessRoute={() => setRoutingHarnessId(null)}
              onUpdateHarnessRoute={(id, route) => updateHarness(id, { route })}
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
              onToggleHarness={(id) => {
                const harness = project.harnesses.find(
                  (item) => item.id === id,
                );
                if (harness?.route)
                  updateHarness(id, { collapsed: !harness.collapsed });
                else setRoutingHarnessId(id);
              }}
              onConnect={connectTerminals}
              onUpdateWireRoute={(id, routePoints) =>
                updateWire(id, { routePoints })
              }
              onDeleteWire={deleteWire}
              onAddDevice={placeDevice}
              onMoveDevice={(id, position) =>
                updateDevice(id, { position: snapPointToGrid(position) })
              }
            />
          </Suspense>
        </section>
        <PropertiesPanel
          project={project}
          selectedId={selectedId}
          selectedWireId={selectedWireId}
          selectedHarnessId={selectedHarnessId}
          updateHarness={updateHarness}
          updateWire={updateWire}
          updateDevice={updateDevice}
          updateDeviceSize={updateDeviceSize}
          onRouteHarness={setRoutingHarnessId}
          onSelectWire={(id) => {
            const wire = project.wires.find((item) => item.id === id);
            if (wire?.harnessId)
              updateHarness(wire.harnessId, { collapsed: false });
            setSelectedHarnessId(null);
            setSelectedWireId(id);
          }}
          onSelectHarness={(id) => {
            setSelectedWireId(null);
            setSelectedHarnessId(id);
          }}
          onDuplicateDevice={(device) => {
            const copy = {
              ...structuredClone(device),
              id: crypto.randomUUID(),
              name: `${device.name} 副本`,
              position: {
                x: device.position.x + GRID_SIZE * 2,
                y: device.position.y + GRID_SIZE * 2,
              },
            };
            changeProject((current) => ({
              ...current,
              devices: [...current.devices, copy],
            }));
            setSelectedId(copy.id);
          }}
          deleteSelectedHarness={deleteSelectedHarness}
          deleteSelectedWire={deleteSelectedWire}
          deleteSelectedDevice={deleteSelectedDevice}
        />{' '}
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
      {editor?.kind === 'harness-create' && (
        <HarnessCreateDialog
          project={project}
          wireIds={editor.wireIds}
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
