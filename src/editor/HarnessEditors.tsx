import { useState } from 'react';
import type { HarnessTemplate, Project, TerminalType } from '../model/project';
import { autoMatchHarness, type ConductorMapping } from './harness';

export function HarnessTemplateEditor({
  initial,
  types,
  onSave,
  onClose,
}: {
  initial: HarnessTemplate;
  types: TerminalType[];
  onSave(value: HarnessTemplate): void;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState('');
  function save() {
    if (
      !draft.name.trim() ||
      !draft.conductors.length ||
      draft.conductors.some((item) => !item.name.trim() || !item.terminalTypeId)
    ) {
      setError('请填写模板名称并配置至少一条有效芯线');
      return;
    }
    onSave({
      ...draft,
      name: draft.name.trim(),
      conductors: draft.conductors.map((item, order) => ({
        ...item,
        name: item.name.trim(),
        order,
      })),
    });
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-template-title"
      >
        <header className="modal-header">
          <h2 id="harness-template-title">编辑线束模板</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭线束模板编辑器"
          >
            ×
          </button>
        </header>
        <div className="form-grid">
          <label>
            模板名称
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label>
            显示颜色
            <input
              type="color"
              value={draft.color}
              onChange={(event) =>
                setDraft({ ...draft, color: event.target.value })
              }
            />
          </label>
          <label className="span-two">
            说明
            <input
              value={draft.description ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </label>
        </div>
        <h3>芯线定义</h3>
        {draft.conductors.map((conductor, index) => (
          <div className="harness-conductor-row" key={conductor.id}>
            <label>
              名称
              <input
                value={conductor.name}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    conductors: draft.conductors.map((item) =>
                      item.id === conductor.id
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <label>
              端子类型
              <select
                value={conductor.terminalTypeId}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    conductors: draft.conductors.map((item) =>
                      item.id === conductor.id
                        ? { ...item, terminalTypeId: event.target.value }
                        : item,
                    ),
                  })
                }
              >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              颜色
              <input
                type="color"
                value={conductor.color ?? draft.color}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    conductors: draft.conductors.map((item) =>
                      item.id === conductor.id
                        ? { ...item, color: event.target.value }
                        : item,
                    ),
                  })
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={conductor.required}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    conductors: draft.conductors.map((item) =>
                      item.id === conductor.id
                        ? { ...item, required: event.target.checked }
                        : item,
                    ),
                  })
                }
              />
              必需
            </label>
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  conductors: draft.conductors.filter((_, i) => i !== index),
                })
              }
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={!types.length}
          onClick={() =>
            setDraft({
              ...draft,
              conductors: [
                ...draft.conductors,
                {
                  id: crypto.randomUUID(),
                  name: `芯线 ${draft.conductors.length + 1}`,
                  terminalTypeId: types[0].id,
                  required: true,
                  order: draft.conductors.length,
                },
              ],
            })
          }
        >
          添加芯线
        </button>
        {error && (
          <p role="alert" className="status-error">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={save}>
            保存模板
          </button>
        </footer>
      </section>
    </div>
  );
}

export function HarnessWizard({
  project,
  onCreate,
  onClose,
}: {
  project: Project;
  onCreate(
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
  ): string | null;
  onClose(): void;
}) {
  const [templateId, setTemplateId] = useState(
    project.harnessLibrary[0]?.id ?? '',
  );
  const [sourceId, setSourceId] = useState(project.devices[0]?.id ?? '');
  const [targetId, setTargetId] = useState(project.devices[1]?.id ?? '');
  const [mappings, setMappings] = useState<ConductorMapping[]>([]);
  const [error, setError] = useState('');
  const [details, setDetails] = useState({
    name: '',
    number: '',
    note: '',
    cableModel: '',
    shielded: false,
  });
  const template = project.harnessLibrary.find(
    (item) => item.id === templateId,
  );
  const source = project.devices.find((item) => item.id === sourceId);
  const target = project.devices.find((item) => item.id === targetId);
  function mappingFor(id: string) {
    return (
      mappings.find((item) => item.conductorId === id) ?? {
        conductorId: id,
        sourceTerminalId: '',
        targetTerminalId: '',
      }
    );
  }
  function updateMapping(id: string, patch: Partial<ConductorMapping>) {
    setMappings((current) => [
      ...current.filter((item) => item.conductorId !== id),
      { ...mappingFor(id), ...patch },
    ]);
  }
  function terminalOptions(device: typeof source, typeId: string) {
    return (
      device?.templateSnapshot.terminals.filter(
        (item) => item.typeId === typeId,
      ) ?? []
    );
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-wizard-title"
      >
        <header className="modal-header">
          <h2 id="harness-wizard-title">创建线束</h2>
          <button type="button" onClick={onClose} aria-label="关闭线束向导">
            ×
          </button>
        </header>
        <div className="form-grid">
          <label>
            线束模板
            <select
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setMappings([]);
              }}
            >
              {project.harnessLibrary.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            线束名称
            <input
              value={details.name}
              onChange={(event) =>
                setDetails({ ...details, name: event.target.value })
              }
              placeholder={template?.name}
            />
          </label>
          <label>
            源设备
            <select
              value={sourceId}
              onChange={(event) => {
                setSourceId(event.target.value);
                setMappings([]);
              }}
            >
              {project.devices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{Math.round(item.position.x)},{' '}
                  {Math.round(item.position.y)}）
                </option>
              ))}
            </select>
          </label>
          <label>
            目标设备
            <select
              value={targetId}
              onChange={(event) => {
                setTargetId(event.target.value);
                setMappings([]);
              }}
            >
              {project.devices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}（{Math.round(item.position.x)},{' '}
                  {Math.round(item.position.y)}）
                </option>
              ))}
            </select>
          </label>
          <label>
            编号
            <input
              value={details.number}
              onChange={(event) =>
                setDetails({ ...details, number: event.target.value })
              }
            />
          </label>
          <label>
            线缆型号
            <input
              value={details.cableModel}
              onChange={(event) =>
                setDetails({ ...details, cableModel: event.target.value })
              }
            />
          </label>
          <label className="span-two">
            备注
            <input
              value={details.note}
              onChange={(event) =>
                setDetails({ ...details, note: event.target.value })
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={details.shielded}
              onChange={(event) =>
                setDetails({ ...details, shielded: event.target.checked })
              }
            />
            屏蔽线缆
          </label>
        </div>
        <div className="section-heading">
          <h3>芯线映射</h3>
          <button
            type="button"
            disabled={!template || !source || !target || sourceId === targetId}
            onClick={() =>
              template &&
              setMappings(
                autoMatchHarness(project, template, sourceId, targetId),
              )
            }
          >
            按名称与类型自动匹配
          </button>
        </div>
        {template?.conductors.map((conductor) => (
          <div key={conductor.id} className="harness-mapping-row">
            <strong>
              {conductor.name}
              {conductor.required ? ' *' : ''}
            </strong>
            <select
              aria-label={`${conductor.name} 源端子`}
              value={mappingFor(conductor.id).sourceTerminalId}
              onChange={(event) =>
                updateMapping(conductor.id, {
                  sourceTerminalId: event.target.value,
                })
              }
            >
              <option value="">选择源端子</option>
              {terminalOptions(source, conductor.terminalTypeId).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              aria-label={`${conductor.name} 目标端子`}
              value={mappingFor(conductor.id).targetTerminalId}
              onChange={(event) =>
                updateMapping(conductor.id, {
                  targetTerminalId: event.target.value,
                })
              }
            >
              <option value="">选择目标端子</option>
              {terminalOptions(target, conductor.terminalTypeId).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="hint">
          创建时会逐芯检查必需映射、端子类型、兼容性、重复连接和容量。
        </p>
        {error && (
          <p role="alert" className="status-error">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={!template || sourceId === targetId}
            onClick={() =>
              template &&
              setError(
                onCreate(template, sourceId, targetId, mappings, {
                  ...details,
                  name: details.name.trim() || template.name,
                }) ?? '',
              )
            }
          >
            创建线束
          </button>
        </footer>
      </section>
    </div>
  );
}
