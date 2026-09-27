import type { Dispatch, SetStateAction } from 'react';
import type { DeviceTemplate, Project, TerminalType } from '../model/project';
import {
  createDeviceTemplate,
  createTerminalType,
  TEMPLATE_DRAG_TYPE,
} from './device';

export type Editor =
  | { kind: 'type'; value: TerminalType }
  | { kind: 'template'; value: DeviceTemplate }
  | { kind: 'harness-create'; wireIds: string[] };

export function LibrarySidebar({
  project,
  selectedHarnessId,
  setEditor,
  deleteType,
  deleteTemplate,
  placeDevice,
  onSelectHarness,
}: {
  project: Project;
  selectedHarnessId: string | null;
  setEditor: Dispatch<SetStateAction<Editor | null>>;
  deleteType(type: TerminalType): void;
  deleteTemplate(template: DeviceTemplate): void;
  placeDevice(templateId: string): void;
  onSelectHarness(id: string): void;
}) {
  const currentTypes = project.terminalTypes;
  const currentTemplates = project.deviceLibrary;
  return (
    <aside className="sidebar" aria-label="资料库">
      <div className="sidebar-heading">
        <h2>资料库</h2>
        <p>端子类型与设备模板</p>
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
                {template.category || '未分类'} · {template.terminals.length}{' '}
                个端子
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
              <button type="button" onClick={() => placeDevice(template.id)}>
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
      {project.harnesses.length > 0 && (
        <section className="library-section">
          <div className="section-heading">
            <h3>画布线束</h3>
          </div>
          <div className="canvas-harness-list">
            {project.harnesses.map((harness) => (
              <button
                key={harness.id}
                type="button"
                className={`canvas-harness-item${selectedHarnessId === harness.id ? ' is-selected' : ''}`}
                aria-current={
                  selectedHarnessId === harness.id ? 'true' : undefined
                }
                title={`${harness.number || harness.name} · ${!harness.route ? '待走线' : harness.collapsed ? '已折叠' : '已展开'}`}
                onClick={() => onSelectHarness(harness.id)}
              >
                <span
                  className="color-dot"
                  style={{
                    backgroundColor: harness.color,
                  }}
                />
                <span className="canvas-harness-copy">
                  <strong>{harness.number || harness.name}</strong>
                  <small>
                    {harness.number && harness.name !== harness.number
                      ? `${harness.name} · `
                      : ''}
                    {
                      project.wires.filter(
                        (wire) => wire.harnessId === harness.id,
                      ).length
                    }{' '}
                    芯
                  </small>
                </span>
                <span className="canvas-harness-state">
                  {!harness.route
                    ? '待走线'
                    : harness.collapsed
                      ? '已折叠'
                      : '已展开'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
