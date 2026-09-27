import { useState, type DragEvent } from 'react';
import type {
  DeviceTemplate,
  ElectricalRole,
  ImageAsset,
  Side,
  TerminalDefinition,
  TerminalType,
} from '../model/project';
import {
  createTerminal,
  GRID_SIZE,
  MIN_DEVICE_HEIGHT,
  MIN_DEVICE_WIDTH,
  reorderTerminals,
  SIDE_LABELS,
  SIDES,
  snapSizeToGrid,
} from './device';
import { readImageAsset } from './assets';

const roles: { value: ElectricalRole; label: string }[] = [
  { value: 'passive', label: '无特定角色' },
  { value: 'power-source', label: '电源输出' },
  { value: 'power-sink', label: '电源输入' },
  { value: 'signal-source', label: '信号输出' },
  { value: 'signal-sink', label: '信号输入' },
  { value: 'bidirectional', label: '双向' },
];

interface TypeEditorProps {
  initial: TerminalType;
  availableTypes: TerminalType[];
  onSave(type: TerminalType): void;
  onClose(): void;
}

export function TypeEditor({
  initial,
  availableTypes,
  onSave,
  onClose,
}: TypeEditorProps) {
  const [draft, setDraft] = useState(initial);
  const choices = availableTypes.some((type) => type.id === draft.id)
    ? availableTypes
    : [...availableTypes, draft];

  return (
    <div className="modal-backdrop">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="type-editor-title"
      >
        <header className="modal-header">
          <h2 id="type-editor-title">编辑端子类型</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭端子类型编辑器"
          >
            ×
          </button>
        </header>
        <div className="form-grid">
          <label>
            名称
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
          <label>
            默认电气角色
            <select
              value={draft.defaultElectricalRole ?? 'passive'}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultElectricalRole: event.target.value as ElectricalRole,
                })
              }
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="compatibility-list">
          <legend>兼容的端子类型</legend>
          <p className="hint">连接时两端都必须把对方列为兼容类型。</p>
          {choices.map((type) => (
            <label key={type.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.compatibleTypeIds.includes(type.id)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    compatibleTypeIds: event.target.checked
                      ? [...draft.compatibleTypeIds, type.id]
                      : draft.compatibleTypeIds.filter((id) => id !== type.id),
                  })
                }
              />
              <span
                className="color-dot"
                style={{ backgroundColor: type.color }}
              />
              {type.id === draft.id ? `${draft.name}（自身）` : type.name}
            </label>
          ))}
        </fieldset>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={!draft.name.trim()}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
          >
            保存类型
          </button>
        </footer>
      </section>
    </div>
  );
}

interface TemplateEditorProps {
  initial: DeviceTemplate;
  terminalTypes: TerminalType[];
  assets: ImageAsset[];
  onSave(template: DeviceTemplate, asset?: ImageAsset): void;
  onClose(): void;
}

export function TemplateEditor({
  initial,
  terminalTypes,
  assets,
  onSave,
  onClose,
}: TemplateEditorProps) {
  const [draft, setDraft] = useState(initial);
  const [pendingAsset, setPendingAsset] = useState<ImageAsset | null>(null);
  const [imageError, setImageError] = useState('');
  const imageAsset =
    pendingAsset?.id === draft.appearance.assetId
      ? pendingAsset
      : assets.find((asset) => asset.id === draft.appearance.assetId);

  async function uploadImage(file?: File) {
    if (!file) return;
    setImageError('');
    try {
      const asset = await readImageAsset(file);
      setPendingAsset(asset);
      setDraft((current) => ({
        ...current,
        appearance: {
          kind: 'image',
          assetId: asset.id,
          imageFit: current.appearance.imageFit ?? 'contain',
        },
      }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : '图片上传失败');
    }
  }

  function updateTerminal(id: string, patch: Partial<TerminalDefinition>) {
    setDraft((current) => ({
      ...current,
      terminals: current.terminals.map((terminal) =>
        terminal.id === id ? { ...terminal, ...patch } : terminal,
      ),
    }));
  }

  function moveTerminal(side: Side, movedId: string, targetId: string) {
    setDraft((current) => ({
      ...current,
      terminals: reorderTerminals(current.terminals, side, movedId, targetId),
    }));
  }

  function onTerminalDrop(
    event: DragEvent<HTMLElement>,
    side: Side,
    targetId: string,
  ) {
    event.preventDefault();
    const movedId = event.dataTransfer.getData('text/plain');
    moveTerminal(side, movedId, targetId);
  }

  function addTerminal(side: Side) {
    if (terminalTypes.length === 0) return;
    const order = draft.terminals.filter(
      (terminal) => terminal.side === side,
    ).length;
    setDraft({
      ...draft,
      terminals: [
        ...draft.terminals,
        createTerminal(side, terminalTypes[0].id, order),
      ],
    });
  }

  function removeTerminal(id: string) {
    setDraft((current) => ({
      ...current,
      terminals: current.terminals
        .filter((terminal) => terminal.id !== id)
        .map((terminal) => ({
          ...terminal,
          order: current.terminals.filter(
            (item) =>
              item.id !== id &&
              item.side === terminal.side &&
              item.order < terminal.order,
          ).length,
        })),
    }));
  }

  return (
    <div className="modal-backdrop">
      <section
        className="modal-card modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-editor-title"
      >
        <header className="modal-header">
          <h2 id="template-editor-title">编辑设备模板</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设备模板编辑器"
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
            分类
            <input
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value })
              }
            />
          </label>
          <label>
            默认宽度（留空自动；每格 30）
            <input
              type="number"
              min={MIN_DEVICE_WIDTH}
              step={GRID_SIZE}
              value={draft.width ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  width:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
              onBlur={(event) => {
                if (event.currentTarget.value === '') return;
                const value = Number(event.currentTarget.value);
                setDraft((current) => ({
                  ...current,
                  width: snapSizeToGrid(value, MIN_DEVICE_WIDTH),
                }));
              }}
            />
          </label>
          <label>
            默认高度（留空自动；每格 30）
            <input
              type="number"
              min={MIN_DEVICE_HEIGHT}
              step={GRID_SIZE}
              value={draft.height ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  height:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
              onBlur={(event) => {
                if (event.currentTarget.value === '') return;
                const value = Number(event.currentTarget.value);
                setDraft((current) => ({
                  ...current,
                  height: snapSizeToGrid(value, MIN_DEVICE_HEIGHT),
                }));
              }}
            />
          </label>
          <label className="span-two">
            默认备注
            <input
              value={draft.note ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
            />
          </label>
        </div>
        <fieldset className="image-editor">
          <legend>设备图片（可选）</legend>
          <label>
            上传 PNG、JPG 或 WebP（不超过 5 MB）
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void uploadImage(event.target.files?.[0])}
            />
          </label>
          {imageError && (
            <p role="alert" className="status-error">
              {imageError}
            </p>
          )}
          {draft.appearance.kind === 'image' && imageAsset ? (
            <div className="image-preview-row">
              <img src={imageAsset.data} alt="设备图片预览" />
              <label>
                显示方式
                <select
                  value={draft.appearance.imageFit ?? 'contain'}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        imageFit: event.target.value as 'contain' | 'cover',
                      },
                    })
                  }
                >
                  <option value="contain">完整显示</option>
                  <option value="cover">填满区域</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  setDraft({ ...draft, appearance: { kind: 'default' } });
                  setPendingAsset(null);
                }}
              >
                移除图片
              </button>
            </div>
          ) : draft.appearance.kind === 'image' ? (
            <p className="hint">图片资产缺失，保存后将显示默认外观。</p>
          ) : null}
        </fieldset>
        <p className="hint">
          四边端子按顺序均匀排列。可拖动端子行调整顺序；实例会保存模板快照。
        </p>
        {terminalTypes.length === 0 && (
          <p className="notice">请先创建端子类型，再添加端子。</p>
        )}
        <div className="side-grid">
          {SIDES.map((side) => {
            const onSide = draft.terminals
              .filter((terminal) => terminal.side === side)
              .sort((a, b) => a.order - b.order);
            return (
              <section
                key={side}
                className="side-card"
                aria-label={`${SIDE_LABELS[side]}端子`}
              >
                <header>
                  <h3>{SIDE_LABELS[side]}</h3>
                  <button
                    type="button"
                    disabled={terminalTypes.length === 0}
                    onClick={() => addTerminal(side)}
                  >
                    添加端子
                  </button>
                </header>
                {onSide.length === 0 && <p className="hint">暂无端子</p>}
                {onSide.map((terminal, index) => (
                  <div
                    key={terminal.id}
                    className="terminal-editor-row"
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData('text/plain', terminal.id)
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onTerminalDrop(event, side, terminal.id)}
                  >
                    <div className="terminal-row-heading">
                      <span aria-hidden="true">☷</span>
                      <strong>端子 {index + 1}</strong>
                      <button
                        type="button"
                        aria-label={`上移 ${terminal.label}`}
                        disabled={index === 0}
                        onClick={() =>
                          moveTerminal(side, terminal.id, onSide[index - 1].id)
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`下移 ${terminal.label}`}
                        disabled={index === onSide.length - 1}
                        onClick={() =>
                          moveTerminal(side, terminal.id, onSide[index + 1].id)
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="danger-text"
                        aria-label={`删除 ${terminal.label}`}
                        onClick={() => removeTerminal(terminal.id)}
                      >
                        删除
                      </button>
                    </div>
                    <label>
                      名称
                      <input
                        value={terminal.label}
                        onChange={(event) =>
                          updateTerminal(terminal.id, {
                            label: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      类型
                      <select
                        value={terminal.typeId}
                        onChange={(event) =>
                          updateTerminal(terminal.id, {
                            typeId: event.target.value,
                          })
                        }
                      >
                        {terminalTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      最大连接数
                      <input
                        type="number"
                        min="1"
                        placeholder="留空表示不限"
                        value={terminal.maxConnections ?? ''}
                        onChange={(event) =>
                          updateTerminal(terminal.id, {
                            maxConnections:
                              event.target.value === ''
                                ? null
                                : Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      电气角色
                      <select
                        value={terminal.electricalRole ?? 'passive'}
                        onChange={(event) =>
                          updateTerminal(terminal.id, {
                            electricalRole: event.target
                              .value as ElectricalRole,
                          })
                        }
                      >
                        {roles.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="primary"
            disabled={
              !draft.name.trim() ||
              (draft.width !== null &&
                (!Number.isFinite(draft.width) ||
                  draft.width < MIN_DEVICE_WIDTH)) ||
              (draft.height !== null &&
                (!Number.isFinite(draft.height) ||
                  draft.height < MIN_DEVICE_HEIGHT)) ||
              draft.terminals.some(
                (terminal) =>
                  !terminal.label.trim() ||
                  !terminal.typeId ||
                  (terminal.maxConnections !== null &&
                    (!Number.isInteger(terminal.maxConnections) ||
                      terminal.maxConnections < 1)),
              )
            }
            onClick={() =>
              onSave(
                {
                  ...draft,
                  name: draft.name.trim(),
                  width:
                    draft.width === null
                      ? null
                      : snapSizeToGrid(draft.width, MIN_DEVICE_WIDTH),
                  height:
                    draft.height === null
                      ? null
                      : snapSizeToGrid(draft.height, MIN_DEVICE_HEIGHT),
                  appearance:
                    draft.appearance.kind === 'image' && !imageAsset
                      ? { kind: 'default' }
                      : draft.appearance,
                  terminals: draft.terminals.map((terminal) => ({
                    ...terminal,
                    label: terminal.label.trim(),
                  })),
                },
                pendingAsset ?? undefined,
              )
            }
          >
            保存模板
          </button>
        </footer>
      </section>
    </div>
  );
}
