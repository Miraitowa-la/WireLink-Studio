import { useReactFlow } from '@xyflow/react';
import type { Dispatch, SetStateAction } from 'react';
import type { Project, WireEndpoint } from '../model/project';
import { snapPointToGrid } from './device';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { wirePath, type Point } from './wireGeometry';
import type { CanvasMenu } from './CanvasContextMenu';

export type WireDraft = {
  source: WireEndpoint;
  points: Point[];
  cursor: Point | null;
};
export type HarnessDraft = {
  source?: Point;
  target?: Point;
  trunkPoints: Point[];
  cursor?: Point;
};
export type HarnessDragging = {
  kind: 'sourceJunction' | 'targetJunction' | 'trunk' | 'source' | 'target';
  wireId?: string;
  index?: number;
};
export type WireDragging = { wireId: string; pointIndex: number; point: Point };

export function CanvasRouteOverlay({
  project,
  selectedHarnessId,
  selectedWireId,
  routingHarnessId,
  draft,
  harnessDraft,
  harnessDragging,
  setHarnessDragging,
  dragging,
  setDragging,
  menu,
  setMenu,
  menuAt,
  updateHarnessPoint,
  onUpdateWireRoute,
}: {
  project: Project;
  selectedHarnessId: string | null;
  selectedWireId: string | null;
  routingHarnessId: string | null;
  draft: WireDraft | null;
  harnessDraft: HarnessDraft | null;
  harnessDragging: HarnessDragging | null;
  setHarnessDragging: Dispatch<SetStateAction<HarnessDragging | null>>;
  dragging: WireDragging | null;
  setDragging: Dispatch<SetStateAction<WireDragging | null>>;
  menu: CanvasMenu | null;
  setMenu: Dispatch<SetStateAction<CanvasMenu | null>>;
  menuAt(clientX: number, clientY: number): Point;
  updateHarnessPoint(
    harnessId: string,
    kind: HarnessDragging['kind'],
    point: Point | null,
    index?: number,
    wireId?: string,
    insert?: boolean,
  ): void;
  onUpdateWireRoute(id: string, points: Point[]): void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const selectedHarness = project.harnesses.find(
    (item) => item.id === selectedHarnessId,
  );
  const selectedHarnessGeometry = selectedHarness?.collapsed
    ? collapsedHarnessGeometry(project, selectedHarness.id)
    : null;
  const selectedWire = project.wires.find((wire) => wire.id === selectedWireId);
  const selectedSource =
    selectedWire && terminalPoint(project, selectedWire.source);
  const selectedTarget =
    selectedWire && terminalPoint(project, selectedWire.target);
  const draftSource = draft && terminalPoint(project, draft.source);
  const previewPoints =
    draft && draftSource
      ? [draftSource, ...draft.points, ...(draft.cursor ? [draft.cursor] : [])]
      : [];

  return (
    <>
      {previewPoints.length > 1 && (
        <svg className="wire-route-preview" aria-hidden="true">
          <path
            d={previewPoints
              .map(
                (point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`,
              )
              .join(' ')}
          />
        </svg>
      )}
      {routingHarnessId && harnessDraft && (
        <svg className="wire-route-preview" aria-hidden="true">
          {harnessDraft.source && (
            <circle
              cx={harnessDraft.source.x}
              cy={harnessDraft.source.y}
              r="5"
            />
          )}
          {harnessDraft.target && (
            <circle
              cx={harnessDraft.target.x}
              cy={harnessDraft.target.y}
              r="5"
            />
          )}
          {harnessDraft.source &&
            (harnessDraft.target || harnessDraft.cursor) && (
              <path
                d={
                  wirePath(
                    harnessDraft.source,
                    harnessDraft.target ?? harnessDraft.cursor!,
                    harnessDraft.trunkPoints,
                  ).path
                }
              />
            )}
          {harnessDraft.source &&
            project.wires
              .filter((wire) => wire.harnessId === routingHarnessId)
              .map((wire) => {
                const source = terminalPoint(
                  project,
                  wire.source.deviceId ===
                    (project.harnesses.find(
                      (item) => item.id === routingHarnessId,
                    )?.route?.sourceDeviceId ??
                      project.wires.find(
                        (item) => item.harnessId === routingHarnessId,
                      )?.source.deviceId)
                    ? wire.source
                    : wire.target,
                );
                const target = terminalPoint(
                  project,
                  wire.target.deviceId ===
                    (project.harnesses.find(
                      (item) => item.id === routingHarnessId,
                    )?.route?.targetDeviceId ??
                      project.wires.find(
                        (item) => item.harnessId === routingHarnessId,
                      )?.target.deviceId)
                    ? wire.target
                    : wire.source,
                );
                return (
                  <g key={wire.id}>
                    {source && (
                      <path d={wirePath(source, harnessDraft.source!).path} />
                    )}
                    {target && harnessDraft.target && (
                      <path d={wirePath(target, harnessDraft.target).path} />
                    )}
                  </g>
                );
              })}
        </svg>
      )}
      {selectedHarnessGeometry &&
        selectedHarness?.route &&
        [
          {
            kind: 'sourceJunction' as const,
            point: selectedHarness.route.sourceJunction,
          },
          {
            kind: 'targetJunction' as const,
            point: selectedHarness.route.targetJunction,
          },
          ...selectedHarness.route.trunkPoints.map((point, index) => ({
            kind: 'trunk' as const,
            point,
            index,
          })),
          ...selectedHarness.route.branches.flatMap((branch) => [
            ...branch.sourcePoints.map((point, index) => ({
              kind: 'source' as const,
              point,
              index,
              wireId: branch.wireId,
            })),
            ...branch.targetPoints.map((point, index) => ({
              kind: 'target' as const,
              point,
              index,
              wireId: branch.wireId,
            })),
          ]),
        ].map((marker, markerIndex) => (
          <button
            key={`${marker.kind}:${'wireId' in marker ? marker.wireId : ''}:${markerIndex}`}
            type="button"
            className="wire-route-point nodrag nopan"
            style={{ left: marker.point.x, top: marker.point.y }}
            title="拖动调整；右键删除分支或主干路径点"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenu({
                ...menuAt(event.clientX, event.clientY),
                harnessId: selectedHarness.id,
                harnessPart:
                  marker.kind === 'sourceJunction' ||
                  marker.kind === 'targetJunction'
                    ? undefined
                    : {
                        kind: marker.kind,
                        wireId: 'wireId' in marker ? marker.wireId : undefined,
                      },
                pointIndex: 'index' in marker ? marker.index : undefined,
              });
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              setHarnessDragging({
                kind: marker.kind,
                wireId: 'wireId' in marker ? marker.wireId : undefined,
                index: 'index' in marker ? marker.index : undefined,
              });
            }}
            onPointerUp={(event) => {
              if (!harnessDragging) return;
              event.stopPropagation();
              updateHarnessPoint(
                selectedHarness.id,
                harnessDragging.kind,
                snapPointToGrid(
                  screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  }),
                ),
                harnessDragging.index,
                harnessDragging.wireId,
              );
              setHarnessDragging(null);
            }}
            onPointerCancel={() => setHarnessDragging(null)}
          />
        ))}
      {selectedWire?.routePoints?.map((point, index) => (
        <button
          key={`${selectedWire.id}:${index}`}
          type="button"
          className="wire-route-point nodrag nopan"
          style={{ left: point.x, top: point.y }}
          title={`路径点 ${index + 1}：拖动调整，右键删除`}
          aria-label={`路径点 ${index + 1}`}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenu({
              ...menuAt(event.clientX, event.clientY),
              wireId: selectedWire.id,
              pointIndex: index,
            });
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setMenu(null);
            setDragging({
              wireId: selectedWire.id,
              pointIndex: index,
              point,
            });
          }}
          onPointerMove={(event) => {
            if (!dragging || dragging.pointIndex !== index) return;
            event.stopPropagation();
            setDragging({
              ...dragging,
              point: snapPointToGrid(
                screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                }),
              ),
            });
          }}
          onPointerUp={(event) => {
            if (!dragging || dragging.pointIndex !== index) return;
            event.stopPropagation();
            const next = [...(selectedWire.routePoints ?? [])];
            next[index] = snapPointToGrid(
              screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            );
            onUpdateWireRoute(selectedWire.id, next);
            setDragging(null);
          }}
          onPointerCancel={() => setDragging(null)}
        />
      ))}
      {menu?.wireId === selectedWire?.id &&
        menu?.pointIndex !== undefined &&
        selectedSource &&
        selectedTarget && (
          <svg
            className="wire-route-preview wire-route-delete-preview"
            aria-hidden="true"
          >
            <path
              d={
                wirePath(
                  selectedSource,
                  selectedTarget,
                  (selectedWire.routePoints ?? []).filter(
                    (_, index) => index !== menu?.pointIndex,
                  ),
                ).path
              }
            />
          </svg>
        )}
      {menu &&
        menu.wireId === selectedWire?.id &&
        menu.pointIndex === undefined &&
        menu.canInsert &&
        menu.insertPoint &&
        menu.insertIndex !== undefined &&
        selectedSource &&
        selectedTarget && (
          <svg className="wire-route-preview" aria-hidden="true">
            <path
              d={
                wirePath(selectedSource, selectedTarget, [
                  ...(selectedWire.routePoints ?? []).slice(
                    0,
                    menu.insertIndex,
                  ),
                  menu.insertPoint,
                  ...(selectedWire.routePoints ?? []).slice(menu.insertIndex),
                ]).path
              }
            />
          </svg>
        )}
    </>
  );
}
