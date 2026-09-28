import type { Project } from '../model/project';
import type { Point } from './wireGeometry';

export type ViewOption = 'showLabels' | 'showDeviceNames' | 'showDeviceImages';

const viewOptions: { key: ViewOption; label: string }[] = [
  { key: 'showLabels', label: '显示导线／线束名称' },
  { key: 'showDeviceNames', label: '显示设备名称' },
  { key: 'showDeviceImages', label: '显示设备图片' },
];

export type CanvasMenu = {
  x: number;
  y: number;
  wireId?: string;
  harnessId?: string;
  harnessPart?: { kind: 'trunk' | 'source' | 'target'; wireId?: string };
  pointIndex?: number;
  insertIndex?: number;
  insertPoint?: Point;
  canInsert?: boolean;
  labelTarget?: { kind: 'wire' | 'harness'; id: string };
  pane?: true;
};

export function CanvasContextMenu({
  menu,
  project,
  multiWireIds,
  onClose,
  onCreateHarness,
  onUpdateWireRoute,
  onDeleteWire,
  onToggleHarness,
  onUpdateLabelOffset,
  onToggleViewPreference,
  onSetAllHarnessCollapsed,
  updateHarnessPoint,
}: {
  menu: CanvasMenu | null;
  project: Project;
  multiWireIds: string[];
  onClose(): void;
  onCreateHarness(wireIds: string[]): void;
  onUpdateWireRoute(id: string, routePoints: Point[]): void;
  onDeleteWire(id: string): void;
  onToggleHarness(id: string): void;
  onUpdateLabelOffset(
    kind: 'wire' | 'harness',
    id: string,
    offset?: Point,
  ): void;
  onToggleViewPreference(key: ViewOption): void;
  onSetAllHarnessCollapsed(collapsed: boolean): void;
  updateHarnessPoint(
    harnessId: string,
    kind: 'sourceJunction' | 'targetJunction' | 'trunk' | 'source' | 'target',
    point: Point | null,
    index?: number,
    wireId?: string,
    insert?: boolean,
  ): void;
}) {
  if (!menu) return null;
  return (
    <div
      className="wire-context-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
    >
      {menu.pane ? (
        <>
          {viewOptions.map(({ key, label }) => {
            const visible = project.viewPreferences?.[key] !== false;
            return (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={visible}
                onClick={() => {
                  onToggleViewPreference(key);
                  onClose();
                }}
              >
                {visible ? '✓ ' : '　'}
                {label}
              </button>
            );
          })}
          <hr className="wire-context-divider" />
          <button
            type="button"
            role="menuitem"
            disabled={
              !project.harnesses.some((item) => item.route && item.collapsed)
            }
            onClick={() => {
              onSetAllHarnessCollapsed(false);
              onClose();
            }}
          >
            全部展开线束
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={
              !project.harnesses.some((item) => item.route && !item.collapsed)
            }
            onClick={() => {
              onSetAllHarnessCollapsed(true);
              onClose();
            }}
          >
            全部折叠线束
          </button>
        </>
      ) : menu.labelTarget ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onUpdateLabelOffset(
              menu.labelTarget!.kind,
              menu.labelTarget!.id,
              undefined,
            );
            onClose();
          }}
        >
          复位名称位置
        </button>
      ) : menu.wireId && menu.pointIndex !== undefined ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const wire = project.wires.find((item) => item.id === menu.wireId);
            if (wire)
              onUpdateWireRoute(
                wire.id,
                (wire.routePoints ?? []).filter(
                  (_, index) => index !== menu?.pointIndex,
                ),
              );
            onClose();
          }}
        >
          删除路径点
        </button>
      ) : menu.wireId ? (
        <>
          {multiWireIds.length >= 2 && multiWireIds.includes(menu.wireId) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onCreateHarness(multiWireIds);
                onClose();
              }}
            >
              创建线束（{multiWireIds.length} 根）
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={!menu.canInsert}
            title={
              menu.canInsert
                ? '在最近的网格点添加路径点'
                : '最近的网格点已有路径点，请在其他位置右键'
            }
            onClick={() => {
              const wire = project.wires.find(
                (item) => item.id === menu.wireId,
              );
              if (wire && menu.insertPoint && menu.insertIndex !== undefined) {
                const next = [...(wire.routePoints ?? [])];
                next.splice(menu.insertIndex, 0, menu.insertPoint);
                onUpdateWireRoute(wire.id, next);
              }
              onClose();
            }}
          >
            添加路径点
          </button>
          <button type="button" role="menuitem" onClick={() => onClose()}>
            编辑导线属性
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDeleteWire(menu.wireId!);
              onClose();
            }}
          >
            删除导线
          </button>
        </>
      ) : menu.harnessId ? (
        <>
          {menu.harnessPart && menu.pointIndex !== undefined && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                updateHarnessPoint(
                  menu.harnessId!,
                  menu.harnessPart!.kind,
                  null,
                  menu.pointIndex,
                  menu.harnessPart!.wireId,
                );
                onClose();
              }}
            >
              删除路径点
            </button>
          )}
          {menu.harnessPart &&
            menu.pointIndex === undefined &&
            menu.insertPoint && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  updateHarnessPoint(
                    menu.harnessId!,
                    menu.harnessPart!.kind,
                    menu.insertPoint!,
                    menu.insertIndex,
                    menu.harnessPart!.wireId,
                    true,
                  );
                  onClose();
                }}
              >
                添加路径点
              </button>
            )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleHarness(menu.harnessId!);
              onClose();
            }}
          >
            {project.harnesses.find((item) => item.id === menu.harnessId)
              ?.collapsed
              ? '展开线束'
              : '折叠线束'}
          </button>
        </>
      ) : null}
    </div>
  );
}
