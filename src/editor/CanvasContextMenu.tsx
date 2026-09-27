import type { Project } from '../model/project';
import type { Point } from './wireGeometry';

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
      {menu.wireId && menu.pointIndex !== undefined ? (
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
