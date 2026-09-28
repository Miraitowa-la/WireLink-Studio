import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { HarnessRoute, Project, WireEndpoint } from '../model/project';
import {
  getDeviceSize,
  GRID_SIZE,
  snapPointToGrid,
  TEMPLATE_DRAG_TYPE,
} from './device';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { editHarnessRoutePoint, finalizeHarnessPath } from './harness';
import { insertionIndex, wirePath, type Point } from './wireGeometry';
import {
  buildCanvasEdges,
  edgeTypes,
  nodeTypes,
  type DeviceFlowNode,
} from './CanvasFlowElements';
import { CanvasContextMenu, type CanvasMenu } from './CanvasContextMenu';
import { relatedObjects } from './selectionFocus';
import {
  CanvasRouteOverlay,
  type HarnessDraft,
  type HarnessDragging,
  type WireDraft,
  type WireDragging,
} from './CanvasRouteOverlay';

const canvasSnapGrid: [number, number] = [GRID_SIZE, GRID_SIZE];

interface CanvasProps {
  project: Project;
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  selectedHarnessId: string | null;
  routingHarnessId: string | null;
  focusTarget: { kind: 'device' | 'wire'; id: string } | null;
  onSelectDevice(id: string | null): void;
  onSelectWire(id: string | null): void;
  onSelectHarness(id: string | null): void;
  onToggleHarness(id: string): void;
  onCreateHarness(wireIds: string[]): void;
  onCompleteHarnessRoute(id: string, route: HarnessRoute): void;
  onCancelHarnessRoute(): void;
  onUpdateHarnessRoute(id: string, route: HarnessRoute): void;
  onConnect(
    source: WireEndpoint,
    target: WireEndpoint,
    routePoints: Point[],
  ): boolean;
  onUpdateWireRoute(id: string, routePoints: Point[]): void;
  onUpdateLabelOffset(
    kind: 'wire' | 'harness',
    id: string,
    offset?: Point,
  ): void;
  onDeleteWire(id: string): void;
  onAddDevice(templateId: string, position: { x: number; y: number }): void;
  onMoveDevice(id: string, position: { x: number; y: number }): void;
}

function Canvas({
  project,
  selectedDeviceId,
  selectedWireId,
  selectedHarnessId,
  routingHarnessId,
  focusTarget,
  onSelectDevice,
  onSelectWire,
  onSelectHarness,
  onToggleHarness,
  onCreateHarness,
  onCompleteHarnessRoute,
  onCancelHarnessRoute,
  onUpdateHarnessRoute,
  onConnect,
  onUpdateWireRoute,
  onUpdateLabelOffset,
  onDeleteWire,
  onAddDevice,
  onMoveDevice,
}: CanvasProps) {
  const { screenToFlowPosition, fitView, setCenter, getViewport, setViewport } =
    useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const middlePan = useRef<{
    pointerId: number;
    x: number;
    y: number;
    viewport: ReturnType<typeof getViewport>;
  } | null>(null);
  const [draft, setDraft] = useState<WireDraft | null>(null);
  const [multiWireIds, setMultiWireIds] = useState<string[]>([]);
  const [harnessDraft, setHarnessDraft] = useState<HarnessDraft | null>(null);
  const [harnessDragging, setHarnessDragging] =
    useState<HarnessDragging | null>(null);
  const focus = useMemo(
    () =>
      draft !== null || routingHarnessId !== null || multiWireIds.length
        ? null
        : relatedObjects(
            project,
            selectedHarnessId
              ? { kind: 'harness', id: selectedHarnessId }
              : selectedWireId
                ? { kind: 'wire', id: selectedWireId }
                : selectedDeviceId
                  ? { kind: 'device', id: selectedDeviceId }
                  : null,
          ),
    [
      project,
      selectedDeviceId,
      selectedWireId,
      selectedHarnessId,
      draft,
      routingHarnessId,
      multiWireIds.length,
    ],
  );
  const completeHarnessDraftRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!routingHarnessId) {
      setHarnessDraft(null);
      return;
    }
    const route = project.harnesses.find(
      (item) => item.id === routingHarnessId,
    )?.route;
    setHarnessDraft(
      route
        ? {
            source: route.sourceJunction,
            points: [...route.trunkPoints, route.targetJunction],
          }
        : { points: [] },
    );
    setMultiWireIds([]);
  }, [routingHarnessId]);
  useEffect(
    () =>
      setMultiWireIds((ids) =>
        ids.filter((id) =>
          project.wires.some((wire) => wire.id === id && !wire.harnessId),
        ),
      ),
    [project.wires],
  );
  const [menu, setMenu] = useState<CanvasMenu | null>(null);
  const [dragging, setDragging] = useState<WireDragging | null>(null);
  const [labelDragging, setLabelDragging] = useState<{
    kind: 'wire' | 'harness';
    id: string;
    pointerId: number;
    start: Point;
    anchor: Point;
    initial: Point;
    offset: Point;
  } | null>(null);
  const terminalClickRef = useRef<(endpoint: WireEndpoint) => void>(() => {});
  const stableTerminalClick = useRef((endpoint: WireEndpoint) =>
    terminalClickRef.current(endpoint),
  ).current;
  const routing = draft !== null || routingHarnessId !== null;
  function snappedLabelOffset(
    drag: NonNullable<typeof labelDragging>,
    clientX: number,
    clientY: number,
  ): Point {
    const point = screenToFlowPosition(
      { x: clientX, y: clientY },
      { snapToGrid: false },
    );
    if (point.x === drag.start.x && point.y === drag.start.y)
      return drag.initial;
    const center = snapPointToGrid(
      {
        x: drag.anchor.x + drag.initial.x + point.x - drag.start.x,
        y: drag.anchor.y + drag.initial.y + point.y - drag.start.y,
      },
      drag.kind === 'harness' ? GRID_SIZE / 2 : GRID_SIZE,
    );
    return { x: center.x - drag.anchor.x, y: center.y - drag.anchor.y };
  }
  useEffect(() => {
    if (routing) setMenu(null);
  }, [routing]);

  useEffect(() => {
    if (!routing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable)
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'button, a[href], summary, [role="button"], [role="menuitem"]',
        ) &&
        event.key !== 'Escape'
      )
        return;
      if (event.key === 'Escape') {
        setDraft(null);
        onCancelHarnessRoute();
      } else if (
        routingHarnessId &&
        event.key === 'Enter' &&
        event.target instanceof Node &&
        wrap.current?.contains(event.target)
      )
        completeHarnessDraftRef.current();
      else if (routingHarnessId && event.key === 'Backspace')
        setHarnessDraft((current) => {
          if (!current) return null;
          return {
            ...current,
            points: current.points.slice(0, -1),
            cursor: undefined,
          };
        });
      else if (event.key === 'Backspace')
        setDraft((current) =>
          current ? { ...current, points: current.points.slice(0, -1) } : null,
        );
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [routing, routingHarnessId, onCancelHarnessRoute]);

  terminalClickRef.current = (endpoint) => {
    setMenu(null);
    if (routingHarnessId) return;
    if (!draft) {
      if (!terminalPoint(project, endpoint)) return;
      onSelectDevice(null);
      onSelectWire(null);
      onSelectHarness(null);
      setDraft({
        source: endpoint,
        points: [],
        cursor: null,
      });
      return;
    }
    if (
      endpoint.deviceId === draft.source.deviceId &&
      endpoint.terminalId === draft.source.terminalId
    )
      return;
    if (!terminalPoint(project, endpoint)) return;
    if (onConnect(draft.source, endpoint, draft.points)) setDraft(null);
  };

  const projectNodes = useMemo<DeviceFlowNode[]>(
    () =>
      project.devices.map((device) => ({
        id: device.id,
        type: 'device',
        position: device.position,
        selected: selectedDeviceId === device.id,
        className:
          focus && !focus.devices.has(device.id) ? 'focus-muted' : undefined,
        zIndex: focus ? (focus.devices.has(device.id) ? 4 : 3) : undefined,
        data: {
          device,
          terminalTypes: project.terminalTypes,
          imageAsset: project.assets.find(
            (asset) => asset.id === device.templateSnapshot.appearance.assetId,
          ),
          onTerminalClick: stableTerminalClick,
        },
      })),
    [
      project.devices,
      project.terminalTypes,
      project.assets,
      selectedDeviceId,
      stableTerminalClick,
      focus,
    ],
  );
  const [nodes, setNodes, onNodesChange] =
    useNodesState<DeviceFlowNode>(projectNodes);
  useEffect(() => setNodes(projectNodes), [projectNodes, setNodes]);
  useEffect(() => {
    if (!project.devices.length) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 1, duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
  }, [project.devices.length, fitView]);
  useEffect(() => {
    if (!focusTarget) return;
    const centerOf = (id: string) => {
      const device = project.devices.find((item) => item.id === id);
      if (!device) return null;
      const size = getDeviceSize(device);
      return {
        x: device.position.x + size.width / 2,
        y: device.position.y + size.height / 2,
      };
    };
    let point = focusTarget.kind === 'device' ? centerOf(focusTarget.id) : null;
    if (focusTarget.kind === 'wire') {
      const wire = project.wires.find((item) => item.id === focusTarget.id);
      const source = wire && centerOf(wire.source.deviceId);
      const target = wire && centerOf(wire.target.deviceId);
      point =
        source && target
          ? { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
          : source || target || null;
    }
    if (point) void setCenter(point.x, point.y, { zoom: 1, duration: 200 });
  }, [focusTarget, setCenter]);
  const previewProject = useMemo(() => {
    if (!harnessDragging || !selectedHarnessId) return project;
    const harness = project.harnesses.find(
      (item) => item.id === selectedHarnessId,
    );
    const route = harness?.route;
    if (!route) return project;
    return {
      ...project,
      harnesses: project.harnesses.map((item) =>
        item.id === selectedHarnessId
          ? {
              ...item,
              route: editHarnessRoutePoint(
                route,
                harnessDragging.kind,
                harnessDragging.point,
                harnessDragging.index,
                harnessDragging.wireId,
              ),
            }
          : item,
      ),
    };
  }, [project, selectedHarnessId, harnessDragging]);
  const edges = useMemo(
    () =>
      buildCanvasEdges(
        previewProject,
        selectedWireId,
        multiWireIds,
        selectedHarnessId,
        dragging,
        focus,
        labelDragging,
      ),
    [
      previewProject,
      selectedWireId,
      multiWireIds,
      selectedHarnessId,
      dragging,
      focus,
      labelDragging,
    ],
  );

  function menuAt(clientX: number, clientY: number): Point {
    const bounds = wrap.current?.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(clientX - (bounds?.left ?? 0), (bounds?.width ?? 190) - 190),
      ),
      y: Math.max(
        0,
        Math.min(clientY - (bounds?.top ?? 0), (bounds?.height ?? 170) - 170),
      ),
    };
  }

  function addDraftPoint(clientX: number, clientY: number) {
    const point = snapPointToGrid(
      screenToFlowPosition({ x: clientX, y: clientY }),
    );
    setDraft((current) => {
      if (!current) return null;
      const source = terminalPoint(project, current.source);
      if (!source) return null;
      const last = current.points.at(-1) ?? source;
      return point.x !== last.x || point.y !== last.y
        ? { ...current, points: [...current.points, point], cursor: point }
        : current;
    });
  }

  function addHarnessDraftPoint(clientX: number, clientY: number) {
    const point = snapPointToGrid(
      screenToFlowPosition({ x: clientX, y: clientY }, { snapToGrid: false }),
      GRID_SIZE / 2,
    );
    setHarnessDraft((current) => {
      const next = current ?? { points: [] };
      if (!next.source) return { ...next, source: point };
      const last = next.points.at(-1) ?? next.source;
      return last.x === point.x && last.y === point.y
        ? next
        : { ...next, points: [...next.points, point] };
    });
  }

  function addRoutingPoint(clientX: number, clientY: number) {
    if (routingHarnessId) addHarnessDraftPoint(clientX, clientY);
    else if (draft) addDraftPoint(clientX, clientY);
  }

  function updateHarnessPoint(
    harnessId: string,
    kind: 'sourceJunction' | 'targetJunction' | 'trunk' | 'source' | 'target',
    point: Point | null,
    index?: number,
    wireId?: string,
    insert = false,
  ) {
    const route = project.harnesses.find(
      (item) => item.id === harnessId,
    )?.route;
    if (!route) return;
    const next = editHarnessRoutePoint(
      route,
      kind,
      point,
      index,
      wireId,
      insert,
    );
    if (next !== route) onUpdateHarnessRoute(harnessId, next);
  }

  function completeHarnessDraft() {
    const path = finalizeHarnessPath(
      harnessDraft?.source,
      harnessDraft?.points ?? [],
    );
    if (!routingHarnessId || !path) return;
    const wires = project.wires.filter(
      (wire) => wire.harnessId === routingHarnessId,
    );
    if (wires.length < 2) return;
    const original = project.harnesses.find(
      (item) => item.id === routingHarnessId,
    )?.route;
    onCompleteHarnessRoute(routingHarnessId, {
      sourceDeviceId: original?.sourceDeviceId ?? wires[0].source.deviceId,
      targetDeviceId: original?.targetDeviceId ?? wires[0].target.deviceId,
      ...path,
      branches: wires.map(
        (wire) =>
          original?.branches.find((branch) => branch.wireId === wire.id) ?? {
            wireId: wire.id,
            sourcePoints: [],
            targetPoints: [],
          },
      ),
    });
  }
  completeHarnessDraftRef.current = completeHarnessDraft;

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const templateId = event.dataTransfer.getData(TEMPLATE_DRAG_TYPE);
    if (
      !templateId ||
      !project.deviceLibrary.some((template) => template.id === templateId)
    )
      return;
    onAddDevice(
      templateId,
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
  }

  return (
    <div
      ref={wrap}
      className="canvas-wrap"
      tabIndex={0}
      aria-label="接线画布快捷键区域"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      onPointerDownCapture={(event) => {
        if (
          !routing &&
          event.button === 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.target instanceof Element
        ) {
          const label = event.target.closest('.react-flow__edge-textwrapper');
          const edge = label?.closest('.react-flow__edge');
          const edgeId = edge?.getAttribute('data-id');
          if (edgeId) {
            const kind = edgeId.startsWith('harness:') ? 'harness' : 'wire';
            const id = kind === 'harness' ? edgeId.slice(8) : edgeId;
            const harness =
              kind === 'harness'
                ? project.harnesses.find((item) => item.id === id)
                : undefined;
            const wire =
              kind === 'wire'
                ? project.wires.find((item) => item.id === id)
                : undefined;
            const source = wire && terminalPoint(project, wire.source);
            const target = wire && terminalPoint(project, wire.target);
            const anchor = harness
              ? collapsedHarnessGeometry(project, id)?.label
              : source && target
                ? wirePath(source, target, wire?.routePoints).label
                : null;
            if (!anchor) return;
            if (kind === 'harness') {
              onSelectDevice(null);
              onSelectWire(null);
              onSelectHarness(id);
            } else {
              onSelectDevice(null);
              onSelectHarness(null);
              onSelectWire(id);
            }
            setMultiWireIds([]);
            setMenu(null);
            const initial = harness?.labelOffset ??
              wire?.labelOffset ?? { x: 0, y: 0 };
            setLabelDragging({
              kind,
              id,
              pointerId: event.pointerId,
              start: screenToFlowPosition(
                { x: event.clientX, y: event.clientY },
                { snapToGrid: false },
              ),
              anchor,
              initial,
              offset: initial,
            });
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
        if (
          !routing ||
          event.button !== 1 ||
          !(event.target instanceof Element) ||
          !event.target.closest('.react-flow__edge')
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        middlePan.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          viewport: getViewport(),
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (labelDragging?.pointerId === event.pointerId) {
          setLabelDragging({
            ...labelDragging,
            offset: snappedLabelOffset(
              labelDragging,
              event.clientX,
              event.clientY,
            ),
          });
          return;
        }
        if (middlePan.current) {
          if (event.pointerId !== middlePan.current.pointerId) return;
          const { x, y, viewport } = middlePan.current;
          void setViewport({
            ...viewport,
            x: viewport.x + event.clientX - x,
            y: viewport.y + event.clientY - y,
          });
          return;
        }
        if (event.buttons & 4) return;
        if (routingHarnessId && harnessDraft && !harnessDragging) {
          const cursor = snapPointToGrid(
            screenToFlowPosition(
              { x: event.clientX, y: event.clientY },
              { snapToGrid: false },
            ),
            GRID_SIZE / 2,
          );
          if (
            cursor.x !== harnessDraft.cursor?.x ||
            cursor.y !== harnessDraft.cursor?.y
          )
            setHarnessDraft({ ...harnessDraft, cursor });
        }
        if (!draft || dragging) return;
        const cursor = snapPointToGrid(
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
        if (cursor.x !== draft.cursor?.x || cursor.y !== draft.cursor?.y)
          setDraft({ ...draft, cursor });
      }}
      onPointerUpCapture={(event) => {
        if (labelDragging?.pointerId === event.pointerId) {
          const offset = snappedLabelOffset(
            labelDragging,
            event.clientX,
            event.clientY,
          );
          if (
            offset.x !== labelDragging.initial.x ||
            offset.y !== labelDragging.initial.y
          )
            onUpdateLabelOffset(labelDragging.kind, labelDragging.id, offset);
          setLabelDragging(null);
          event.currentTarget.releasePointerCapture(event.pointerId);
          return;
        }
        if (event.pointerId === middlePan.current?.pointerId)
          middlePan.current = null;
      }}
      onPointerCancelCapture={(event) => {
        if (labelDragging?.pointerId === event.pointerId) {
          setLabelDragging(null);
          return;
        }
        if (event.pointerId === middlePan.current?.pointerId)
          middlePan.current = null;
      }}
      onContextMenuCapture={(event) => {
        if (routing || !(event.target instanceof Element)) return;
        const label = event.target.closest('.react-flow__edge-textwrapper');
        const edgeId = label
          ?.closest('.react-flow__edge')
          ?.getAttribute('data-id');
        if (!edgeId) return;
        event.preventDefault();
        event.stopPropagation();
        const position = menuAt(event.clientX, event.clientY);
        if (edgeId.startsWith('harness:')) {
          const id = edgeId.slice(8);
          onSelectDevice(null);
          onSelectWire(null);
          onSelectHarness(id);
          setMenu({ ...position, labelTarget: { kind: 'harness', id } });
        } else {
          onSelectDevice(null);
          onSelectHarness(null);
          onSelectWire(edgeId);
          setMenu({
            ...position,
            labelTarget: { kind: 'wire', id: edgeId },
          });
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        snapToGrid
        snapGrid={canvasSnapGrid}
        panOnDrag={routing ? [1] : true}
        elevateNodesOnSelect={!focus}
        elevateEdgesOnSelect={!focus}
        nodesDraggable={!routing}
        zoomOnDoubleClick={!routing}
        onNodeClick={(_, node) => {
          if (routing) return;
          setMultiWireIds([]);
          onSelectWire(null);
          onSelectHarness(null);
          onSelectDevice(node.id);
        }}
        onEdgeClick={(event, edge) => {
          setMenu(null);
          if (routing) {
            if (event.button === 0)
              addRoutingPoint(event.clientX, event.clientY);
            return;
          }
          onSelectDevice(null);
          if (edge.id.startsWith('harness:')) {
            setMultiWireIds([]);
            onSelectWire(null);
            onSelectHarness(edge.id.slice(8));
          } else if (event.ctrlKey || event.metaKey) {
            const wire = project.wires.find((item) => item.id === edge.id);
            if (wire?.harnessId) return;
            setMultiWireIds((ids) =>
              ids.includes(edge.id)
                ? ids.filter((id) => id !== edge.id)
                : [...ids, edge.id],
            );
            onSelectWire(null);
            onSelectHarness(null);
          } else {
            setMultiWireIds([]);
            onSelectHarness(null);
            onSelectWire(edge.id);
          }
        }}
        onEdgeDoubleClick={(_, edge) => {
          if (routing) return;
          if (edge.id.startsWith('harness:')) onToggleHarness(edge.id.slice(8));
          else {
            const wire = project.wires.find((item) => item.id === edge.id);
            if (wire?.harnessId) onToggleHarness(wire.harnessId);
          }
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          if (routing) {
            setMenu(null);
            return;
          }
          const position = menuAt(event.clientX, event.clientY);
          if (edge.id.startsWith('harness:')) {
            onSelectDevice(null);
            onSelectWire(null);
            onSelectHarness(edge.id.slice(8));
            const harnessId = edge.id.slice(8);
            const geometry = collapsedHarnessGeometry(project, harnessId);
            const clickPoint = screenToFlowPosition(
              { x: event.clientX, y: event.clientY },
              { snapToGrid: false },
            );
            const nearest = geometry?.paths
              .map((part) => ({
                part,
                index: insertionIndex(
                  wirePath(
                    part.points[0],
                    part.points.at(-1)!,
                    part.points.slice(1, -1),
                  ).segments,
                  clickPoint,
                ),
              }))
              .map((entry) => {
                const from = entry.part.points[entry.index],
                  to = entry.part.points[entry.index + 1];
                const dx = to.x - from.x,
                  dy = to.y - from.y;
                const t =
                  dx * dx + dy * dy
                    ? Math.max(
                        0,
                        Math.min(
                          1,
                          ((clickPoint.x - from.x) * dx +
                            (clickPoint.y - from.y) * dy) /
                            (dx * dx + dy * dy),
                        ),
                      )
                    : 0;
                return {
                  ...entry,
                  distance:
                    (clickPoint.x - from.x - t * dx) ** 2 +
                    (clickPoint.y - from.y - t * dy) ** 2,
                };
              })
              .sort((a, b) => a.distance - b.distance)[0];
            setMenu({
              ...position,
              harnessId,
              harnessPart: nearest && {
                kind: nearest.part.kind,
                wireId: nearest.part.wireId,
              },
              insertIndex: nearest?.index,
              insertPoint: snapPointToGrid(clickPoint, GRID_SIZE / 2),
            });
            return;
          }
          const wire = project.wires.find((item) => item.id === edge.id);
          if (!wire) return;
          const source = terminalPoint(project, wire.source);
          const target = terminalPoint(project, wire.target);
          if (!source || !target) return;
          const clickPoint = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          const insertPoint = snapPointToGrid(clickPoint);
          const geometry = wirePath(source, target, wire.routePoints);
          const insertIndex = insertionIndex(geometry.segments, clickPoint);
          onSelectDevice(null);
          onSelectHarness(null);
          if (!multiWireIds.includes(wire.id)) {
            setMultiWireIds([]);
            onSelectWire(wire.id);
          }
          setMenu({
            ...position,
            wireId: wire.id,
            insertPoint,
            insertIndex,
            canInsert: !geometry.points.some(
              (point) => point.x === insertPoint.x && point.y === insertPoint.y,
            ),
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu(null);
        }}
        onPaneClick={(event) => {
          setMenu(null);
          if (routing) {
            if (event.button !== 0) return;
            wrap.current?.focus();
            addRoutingPoint(event.clientX, event.clientY);
            return;
          }
          setMultiWireIds([]);
          onSelectDevice(null);
          onSelectWire(null);
          onSelectHarness(null);
        }}
        onNodeDragStop={(_, node) => onMoveDevice(node.id, node.position)}
        deleteKeyCode={null}
        ariaLabelConfig={{
          'node.a11yDescription.default': '按回车选择设备，方向键移动设备',
        }}
      >
        {/* React Flow centers dots inside each cell; shift them onto grid coordinates. */}
        <Background
          gap={GRID_SIZE}
          size={1}
          offset={(1 - GRID_SIZE) / 2}
          color="#a9bdcf"
        />
        <ViewportPortal>
          <CanvasRouteOverlay
            project={previewProject}
            selectedHarnessId={selectedHarnessId}
            selectedWireId={selectedWireId}
            routingHarnessId={routingHarnessId}
            draft={draft}
            harnessDraft={harnessDraft}
            harnessDragging={harnessDragging}
            setHarnessDragging={setHarnessDragging}
            dragging={dragging}
            setDragging={setDragging}
            menu={routing ? null : menu}
            setMenu={setMenu}
            menuAt={menuAt}
            updateHarnessPoint={updateHarnessPoint}
            onUpdateWireRoute={onUpdateWireRoute}
          />
        </ViewportPortal>
        {project.devices.length > 1 && (
          <MiniMap
            pannable
            zoomable
            style={{ width: 160, height: 100, bottom: 18 }}
            nodeColor="#8fb4d8"
            nodeStrokeColor="#4d7196"
            maskColor="#1764b11a"
          />
        )}
        <Controls />
      </ReactFlow>
      {draft && (
        <div className="wire-route-hint">
          点击网格点确定下一点，点击终点端子完成 · Backspace 撤回 · Esc 取消
          <button type="button" onClick={() => setDraft(null)}>
            取消
          </button>
        </div>
      )}
      {routingHarnessId && (
        <div className="wire-route-hint">
          {!harnessDraft?.source
            ? '点击网格设置第一侧汇合点'
            : '点击追加至少一个路径点 · Enter 将最后一点设为第二侧汇合点并完成 · Backspace 删除最后一点 · Esc 取消'}
          <button type="button" onClick={onCancelHarnessRoute}>
            取消
          </button>
        </div>
      )}
      {multiWireIds.length > 0 && !routingHarnessId && (
        <div className="wire-route-hint">
          已选择 {multiWireIds.length} 根导线 · Ctrl + 点击增减选择 ·
          右键创建线束
        </div>
      )}
      <CanvasContextMenu
        menu={routing ? null : menu}
        project={project}
        multiWireIds={multiWireIds}
        onClose={() => setMenu(null)}
        onCreateHarness={onCreateHarness}
        onUpdateWireRoute={onUpdateWireRoute}
        onDeleteWire={onDeleteWire}
        onToggleHarness={onToggleHarness}
        onUpdateLabelOffset={onUpdateLabelOffset}
        updateHarnessPoint={updateHarnessPoint}
      />{' '}
      {project.devices.length === 0 && (
        <div className="canvas-empty">
          从左侧设备库拖入设备，或点击“放入画布”
        </div>
      )}
    </div>
  );
}

export default function DeviceCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
