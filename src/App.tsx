import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import DeviceCanvas, { TEMPLATE_DRAG_TYPE } from './editor/DeviceCanvas';
import {
  addDevice,
  copyTemplateToProject,
  createDeviceTemplate,
  createTerminalType,
} from './editor/device';
import { TemplateEditor, TypeEditor } from './editor/LibraryEditors';
import {
  loadPublicLibrary,
  savePublicLibrary,
  type PublicLibrary,
} from './editor/localLibrary';
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
  type Project,
  type TerminalType,
} from './model/project';

type Scope = 'project' | 'public';
type Editor =
  | { kind: 'type'; scope: Scope; value: TerminalType }
  | { kind: 'template'; scope: Scope; value: DeviceTemplate };
type Status = { kind: 'info' | 'error'; text: string } | null;

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState('未命名工程');
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('project');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [publicLibrary, setPublicLibrary] = useState<PublicLibrary | null>(
    () => {
      try {
        return loadPublicLibrary();
      } catch {
        return null;
      }
    },
  );
  const fileHandle = useRef<ProjectFileHandle | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const revision = useRef(0);
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
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        project
      ) {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  });

  function changeProject(update: (current: Project) => Project) {
    setProject((current) => (current ? update(current) : current));
    revision.current += 1;
    setDirty(true);
    setStatus(null);
  }

  function changePublicLibrary(
    update: (current: PublicLibrary) => PublicLibrary,
  ): boolean {
    if (!publicLibrary) return false;
    try {
      const next = update(publicLibrary);
      savePublicLibrary(next);
      setPublicLibrary(next);
      setStatus({ kind: 'info', text: '已保存到本机公共库' });
      return true;
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
      return false;
    }
  }

  function canReplaceProject() {
    return (
      !dirty || window.confirm('当前工程有未保存的修改，确定放弃并继续吗？')
    );
  }

  function newProject() {
    if (!canReplaceProject()) return;
    setProject(createEmptyProject(projectName.trim() || '未命名工程'));
    revision.current = 1;
    fileHandle.current = null;
    setDirty(true);
    setSelectedId(null);
    setScope('project');
    setStatus({ kind: 'info', text: '空工程已创建，请显式保存到文件' });
  }

  function backToWelcome() {
    if (!canReplaceProject()) return;
    setProject(null);
    revision.current = 0;
    fileHandle.current = null;
    setDirty(false);
    setSelectedId(null);
    setStatus(null);
  }

  function acceptProject(next: Project, handle: ProjectFileHandle | null) {
    setProject(next);
    revision.current = 0;
    setProjectName(next.name);
    fileHandle.current = handle;
    setDirty(false);
    setSelectedId(null);
    setScope('project');
    setStatus({ kind: 'info', text: `已打开工程“${next.name}”` });
  }

  async function openProject() {
    if (!canReplaceProject()) return;
    if (!hasFilePicker()) {
      fileInput.current?.click();
      return;
    }
    try {
      const { project: next, handle } = await openProjectWithPicker();
      acceptProject(next, handle);
    } catch (error) {
      if (!isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      acceptProject(await readProjectFile(file), null);
    } catch (error) {
      setStatus({ kind: 'error', text: errorMessage(error) });
    }
  }

  async function save() {
    if (!project || saving.current) return;
    saving.current = true;
    const savedRevision = revision.current;
    try {
      fileHandle.current = await saveProjectFile(project, fileHandle.current);
      const changedDuringSave = revision.current !== savedRevision;
      if (!changedDuringSave) setDirty(false);
      setStatus({
        kind: 'info',
        text: changedDuringSave
          ? '文件已写入，但期间产生了新修改，请再次保存'
          : fileHandle.current
            ? '工程已保存'
            : '工程文件已下载',
      });
    } catch (error) {
      if (!isPickerCancel(error))
        setStatus({ kind: 'error', text: errorMessage(error) });
    } finally {
      saving.current = false;
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
    if (editor.scope === 'project')
      changeProject((current) => ({
        ...current,
        terminalTypes: upsert(current.terminalTypes, value),
      }));
    else if (
      !changePublicLibrary((current) => ({
        ...current,
        terminalTypes: upsert(current.terminalTypes, value),
      }))
    )
      return;
    setEditor(null);
  }

  function saveTemplate(value: DeviceTemplate) {
    if (!editor) return;
    if (!deviceTemplateSchema.safeParse(value).success) {
      setStatus({ kind: 'error', text: '设备模板信息无效，请检查尺寸和端子' });
      return;
    }
    if (editor.scope === 'project')
      changeProject((current) => ({
        ...current,
        deviceLibrary: upsert(current.deviceLibrary, value),
      }));
    else if (
      !changePublicLibrary((current) => ({
        ...current,
        deviceTemplates: upsert(current.deviceTemplates, value),
      }))
    )
      return;
    setEditor(null);
  }

  function deleteType(type: TerminalType) {
    if (!project) return;
    const templates =
      scope === 'project'
        ? project.deviceLibrary
        : (publicLibrary?.deviceTemplates ?? []);
    const referenced =
      templates.some((template) =>
        template.terminals.some((terminal) => terminal.typeId === type.id),
      ) ||
      (scope === 'project' &&
        project.devices.some((device) =>
          device.templateSnapshot.terminals.some(
            (terminal) => terminal.typeId === type.id,
          ),
        ));
    if (referenced) {
      setStatus({
        kind: 'error',
        text: `端子类型“${type.name}”仍被模板或设备实例引用，不能删除`,
      });
      return;
    }
    if (!window.confirm(`删除端子类型“${type.name}”？`)) return;
    if (scope === 'project')
      changeProject((current) => ({
        ...current,
        terminalTypes: current.terminalTypes.filter(
          (item) => item.id !== type.id,
        ),
      }));
    else
      changePublicLibrary((current) => ({
        ...current,
        terminalTypes: current.terminalTypes.filter(
          (item) => item.id !== type.id,
        ),
      }));
  }

  function deleteTemplate(template: DeviceTemplate) {
    if (!project) return;
    const references =
      scope === 'project'
        ? project.devices.filter((device) => device.templateId === template.id)
            .length
        : 0;
    if (references > 0) {
      setStatus({
        kind: 'error',
        text: `模板“${template.name}”被 ${references} 个设备实例引用，不能删除`,
      });
      return;
    }
    if (!window.confirm(`删除设备模板“${template.name}”？`)) return;
    if (scope === 'project')
      changeProject((current) => ({
        ...current,
        deviceLibrary: current.deviceLibrary.filter(
          (item) => item.id !== template.id,
        ),
      }));
    else
      changePublicLibrary((current) => ({
        ...current,
        deviceTemplates: current.deviceTemplates.filter(
          (item) => item.id !== template.id,
        ),
      }));
  }

  function copyPublicTemplate(template: DeviceTemplate) {
    if (!project || !publicLibrary) return;
    const typeIds = new Set(publicLibrary.terminalTypes.map((type) => type.id));
    const missing = template.terminals.find(
      (terminal) => !typeIds.has(terminal.typeId),
    );
    if (missing) {
      setStatus({
        kind: 'error',
        text: `公共模板缺少端子类型 ${missing.typeId}，无法复制`,
      });
      return;
    }
    changeProject((current) =>
      copyTemplateToProject(current, template, publicLibrary.terminalTypes),
    );
    setScope('project');
    setStatus({
      kind: 'info',
      text: `已将“${template.name}”及所需端子类型复制到项目库`,
    });
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
    const offset = project.devices.length * 32;
    changeProject((current) =>
      addDevice(
        current,
        template,
        position ?? { x: 80 + offset, y: 80 + offset },
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
      return {
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
      };
    });
    setSelectedId(null);
  }

  const currentTypes =
    scope === 'project'
      ? (project?.terminalTypes ?? [])
      : (publicLibrary?.terminalTypes ?? []);
  const currentTemplates =
    scope === 'project'
      ? (project?.deviceLibrary ?? [])
      : (publicLibrary?.deviceTemplates ?? []);
  const selectedDevice = project?.devices.find(
    (device) => device.id === selectedId,
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
          <button type="button" onClick={backToWelcome}>
            新建
          </button>
          <button type="button" onClick={() => void openProject()}>
            打开
          </button>
          <button type="button" className="primary" onClick={() => void save()}>
            保存
          </button>
        </nav>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="资料库">
          <div className="sidebar-heading">
            <h2>资料库</h2>
            <p>端子与设备模板</p>
          </div>
          <div className="scope-switch" role="group" aria-label="资料库范围">
            <button
              type="button"
              className={scope === 'project' ? 'active' : ''}
              onClick={() => setScope('project')}
            >
              项目库
            </button>
            <button
              type="button"
              className={scope === 'public' ? 'active' : ''}
              onClick={() => setScope('public')}
            >
              公共库
            </button>
          </div>
          {scope === 'public' && !publicLibrary ? (
            <p role="alert" className="status status-error">
              本机公共库数据无效，已暂停编辑以免覆盖原有数据。
            </p>
          ) : (
            <>
              <section className="library-section">
                <div className="section-heading">
                  <h3>端子类型</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        kind: 'type',
                        scope,
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
                      onClick={() =>
                        setEditor({ kind: 'type', scope, value: type })
                      }
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
                        scope,
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
                    draggable={scope === 'project'}
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        TEMPLATE_DRAG_TYPE,
                        template.id,
                      )
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
                            scope,
                            value: template,
                          })
                        }
                      >
                        编辑
                      </button>
                      {scope === 'project' ? (
                        <button
                          type="button"
                          onClick={() => placeDevice(template.id)}
                        >
                          放入画布
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => copyPublicTemplate(template)}
                        >
                          复制到项目
                        </button>
                      )}
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
            </>
          )}
        </aside>

        <section className="canvas-panel" aria-label="接线画布">
          <div className="canvas-heading">
            <span>接线画布</span>
            <span>{project.devices.length} 台设备</span>
          </div>
          <DeviceCanvas
            project={project}
            selectedDeviceId={selectedId}
            onSelectDevice={setSelectedId}
            onAddDevice={placeDevice}
            onMoveDevice={(id, position) => updateDevice(id, { position })}
          />
        </section>

        <aside className="properties" aria-label="属性面板">
          <div className="sidebar-heading">
            <h2>属性</h2>
            <p>{selectedDevice ? '设备实例' : '选择画布中的设备'}</p>
          </div>
          {selectedDevice ? (
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
                  宽度
                  <input
                    type="number"
                    min="80"
                    value={
                      selectedDevice.size?.width ??
                      selectedDevice.templateSnapshot.width
                    }
                    onChange={(event) =>
                      updateDevice(selectedDevice.id, {
                        size: {
                          width: Math.max(80, Number(event.target.value)),
                          height:
                            selectedDevice.size?.height ??
                            selectedDevice.templateSnapshot.height,
                        },
                      })
                    }
                  />
                </label>
                <label>
                  高度
                  <input
                    type="number"
                    min="80"
                    value={
                      selectedDevice.size?.height ??
                      selectedDevice.templateSnapshot.height
                    }
                    onChange={(event) =>
                      updateDevice(selectedDevice.id, {
                        size: {
                          width:
                            selectedDevice.size?.width ??
                            selectedDevice.templateSnapshot.width,
                          height: Math.max(80, Number(event.target.value)),
                        },
                      })
                    }
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
                        x: selectedDevice.position.x + 40,
                        y: selectedDevice.position.y + 40,
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
              点击设备以编辑名称、尺寸与备注。
            </p>
          )}
        </aside>
      </div>
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
          availableTypes={
            editor.scope === 'project'
              ? project.terminalTypes
              : (publicLibrary?.terminalTypes ?? [])
          }
          onSave={saveType}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.kind === 'template' && (
        <TemplateEditor
          key={editor.value.id}
          initial={editor.value}
          terminalTypes={
            editor.scope === 'project'
              ? project.terminalTypes
              : (publicLibrary?.terminalTypes ?? [])
          }
          onSave={saveTemplate}
          onClose={() => setEditor(null)}
        />
      )}
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
