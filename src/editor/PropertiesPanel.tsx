import type {
  DeviceInstance,
  HarnessConnection,
  Project,
  Wire,
} from '../model/project';
import {
  getDeviceSize,
  GRID_SIZE,
  MIN_DEVICE_HEIGHT,
  MIN_DEVICE_WIDTH,
} from './device';

export function PropertiesPanel({
  project,
  selectedId,
  selectedWireId,
  selectedHarnessId,
  updateHarness,
  updateWire,
  updateDevice,
  updateDeviceSize,
  onRouteHarness,
  onSelectWire,
  onSelectHarness,
  onDuplicateDevice,
  deleteSelectedHarness,
  deleteSelectedWire,
  deleteSelectedDevice,
}: {
  project: Project;
  selectedId: string | null;
  selectedWireId: string | null;
  selectedHarnessId: string | null;
  updateHarness(id: string, patch: Partial<HarnessConnection>): void;
  updateWire(id: string, patch: Partial<Wire>): void;
  updateDevice(id: string, patch: Partial<DeviceInstance>): void;
  updateDeviceSize(
    device: DeviceInstance,
    dimension: 'width' | 'height',
    raw: number,
    input: HTMLInputElement,
  ): void;
  onRouteHarness(id: string): void;
  onSelectWire(id: string): void;
  onSelectHarness(id: string): void;
  onDuplicateDevice(device: DeviceInstance): void;
  deleteSelectedHarness(): void;
  deleteSelectedWire(): void;
  deleteSelectedDevice(): void;
}) {
  const selectedDevice = project.devices.find(
    (device) => device.id === selectedId,
  );
  const selectedWire = project.wires.find((wire) => wire.id === selectedWireId);
  const selectedHarness = project.harnesses.find(
    (harness) => harness.id === selectedHarnessId,
  );
  return (
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
            线束 ·{' '}
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
          <label>
            线束颜色
            <input
              type="color"
              value={selectedHarness.color}
              onChange={(event) =>
                updateHarness(selectedHarness.id, {
                  color: event.target.value,
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              selectedHarness.route
                ? updateHarness(selectedHarness.id, {
                    collapsed: !selectedHarness.collapsed,
                  })
                : onRouteHarness(selectedHarness.id)
            }
          >
            {selectedHarness.route
              ? selectedHarness.collapsed
                ? '展开芯线'
                : '折叠线束'
              : '线束走线'}
          </button>
          {selectedHarness.route && (
            <button
              type="button"
              onClick={() => onRouteHarness(selectedHarness.id)}
            >
              重新走线
            </button>
          )}
          <h3>芯线</h3>
          {project.wires
            .filter((wire) => wire.harnessId === selectedHarness.id)
            .map((wire) => (
              <button
                key={wire.id}
                type="button"
                className="table-link"
                onClick={() => onSelectWire(wire.id)}
              >
                {wire.name || wire.number || '未命名导线'}
              </button>
            ))}
          <button
            type="button"
            className="danger-text"
            onClick={deleteSelectedHarness}
          >
            解除线束分组
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
              onClick={() => onSelectHarness(selectedWire.harnessId!)}
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
              onClick={() => onDuplicateDevice(selectedDevice)}
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
          点击端子开始手动走线；点击设备、导线或线束以编辑属性。
        </p>
      )}
    </aside>
  );
}
