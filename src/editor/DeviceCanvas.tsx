import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type {
  DeviceInstance,
  HarnessRoute,
  ImageAsset,
  Project,
  Side,
  TerminalType,
  WireEndpoint,
} from '../model/project';
import {
  getDeviceSize,
  GRID_SIZE,
  SIDES,
  snapPointToGrid,
  terminalOffset,
} from './device';
import { collapsedHarnessGeometry, terminalPoint } from './harnessGeometry';
import { insertionIndex, wirePath, type Point } from './wireGeometry';

export const TEMPLATE_DRAG_TYPE = 'application/wirelink-device-template';

type DeviceFlowNode = Node<
  {
    device: DeviceInstance;
    terminalTypes: TerminalType[];
    imageAsset?: ImageAsset;
    onTerminalClick: (endpoint: WireEndpoint) => void;
  },
  'device'
>;

const positions: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function DeviceNode({ data, selected }: NodeProps<DeviceFlowNode>) {
  const { device, terminalTypes, imageAsset, onTerminalClick } = data;
  const { width, height } = getDeviceSize(device);
  const terminals = device.templateSnapshot.terminals;
  const colors = new Map(terminalTypes.map((type) => [type.id, type.color]));

  return (
    <div
      className={`device-node${selected ? ' device-node-selected' : ''}`}
      style={{ width, height }}
    >
      {device.templateSnapshot.appearance.kind === 'image' && imageAsset && (
        <img
          className="device-node-image"
          src={imageAsset.data}
          alt=""
          style={{
            objectFit: device.templateSnapshot.appearance.imageFit ?? 'contain',
          }}
        />
      )}
      <div className="device-node-center">
        <strong>{device.name}</strong>
        {device.templateSnapshot.category && (
          <small>{device.templateSnapshot.category}</small>
        )}
      </div>
      {SIDES.flatMap((side) => {
        const onSide = terminals
          .filter((terminal) => terminal.side === side)
          .sort((a, b) => a.order - b.order);
        return onSide.map((terminal, index) => {
          const offset = terminalOffset(
            side === 'top' || side === 'bottom' ? width : height,
            onSide.length,
            index,
          );
          const style =
            side === 'top' || side === 'bottom'
              ? { left: offset }
              : { top: offset };
          return (
            <div key={terminal.id}>
              <Handle
                type="source"
                id={terminal.id}
                position={positions[side]}
                isConnectable={false}
                isConnectableStart={false}
                isConnectableEnd={false}
                className="terminal-handle"
                onClick={(event) => {
                  event.stopPropagation();
                  onTerminalClick({
                    deviceId: device.id,
                    terminalId: terminal.id,
                  });
                }}
                style={{
                  ...style,
                  backgroundColor: colors.get(terminal.typeId) ?? '#64748b',
                }}
                title={`${terminal.label} · ${terminalTypes.find((type) => type.id === terminal.typeId)?.name ?? terminal.typeId}`}
              />
              <span
                className={`terminal-label terminal-label-${side}`}
                style={{
                  ...style,
                  ...((side === 'top' || side === 'bottom') &&
                  onSide.length === 1
                    ? { maxWidth: 66 }
                    : {}),
                }}
                title={terminal.label}
              >
                {terminal.label}
              </span>
            </div>
          );
        });
      })}
    </div>
  );
}

const nodeTypes = { device: DeviceNode };
const canvasSnapGrid: [number, number] = [GRID_SIZE, GRID_SIZE];
// React Flow supplies the outer edge of the 10px handle; wires use its center.
const terminalHandleRadius = 5;
const handleCenter = (point: Point, side: Position): Point => ({
  x:
    point.x +
    (side === Position.Left
      ? terminalHandleRadius
      : side === Position.Right
        ? -terminalHandleRadius
        : 0),
  y:
    point.y +
    (side === Position.Top
      ? terminalHandleRadius
      : side === Position.Bottom
        ? -terminalHandleRadius
        : 0),
});
type Draft = {
  source: WireEndpoint;
  points: Point[];
  cursor: Point | null;
};
type CanvasMenu = {
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

type RoutedEdge = Edge<{ routePoints: Point[] }, 'routed'>;

function RoutedEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  label,
  style,
  interactionWidth,
}: EdgeProps<RoutedEdge>) {
  if (!data) return null;
  const geometry = wirePath(
    handleCenter({ x: sourceX, y: sourceY }, sourcePosition),
    handleCenter({ x: targetX, y: targetY }, targetPosition),
    data.routePoints,
  );
  return (
    <BaseEdge
      path={geometry.path}
      labelX={geometry.label.x}
      labelY={geometry.label.y}
      label={label}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
type HarnessEdge = Edge<
  NonNullable<ReturnType<typeof collapsedHarnessGeometry>>,
  'harness'
>;
function HarnessEdge({
  data,
  label,
  style,
  interactionWidth,
}: EdgeProps<HarnessEdge>) {
  if (!data) return null;
  return (
    <>
      {data.paths.slice(1).map((item, index) => (
        <BaseEdge
          key={index}
          path={item.path}
          style={{ ...style, stroke: item.color, strokeWidth: 2.5 }}
          interactionWidth={interactionWidth}
        />
      ))}
      <BaseEdge
        path={data.trunk}
        labelX={data.label.x}
        labelY={data.label.y}
        label={label}
        style={style}
        interactionWidth={interactionWidth}
      />
    </>
  );
}
const edgeTypes = { routed: RoutedEdge, harness: HarnessEdge };

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
  onDeleteWire,
  onAddDevice,
  onMoveDevice,
}: CanvasProps) {
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [multiWireIds, setMultiWireIds] = useState<string[]>([]);
  const [harnessDraft, setHarnessDraft] = useState<{
    source?: Point;
    target?: Point;
    trunkPoints: Point[];
    cursor?: Point;
  } | null>(null);
  const [harnessDragging, setHarnessDragging] = useState<{
    kind: 'sourceJunction' | 'targetJunction' | 'trunk' | 'source' | 'target';
    wireId?: string;
    index?: number;
  } | null>(null);
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
            target: route.targetJunction,
            trunkPoints: route.trunkPoints,
          }
        : { trunkPoints: [] },
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
  const [dragging, setDragging] = useState<{
    wireId: string;
    pointIndex: number;
    point: Point;
  } | null>(null);
  const terminalClickRef = useRef<(endpoint: WireEndpoint) => void>(() => {});
  const stableTerminalClick = useRef((endpoint: WireEndpoint) =>
    terminalClickRef.current(endpoint),
  ).current;
  const routing = draft !== null || routingHarnessId !== null;

  useEffect(() => {
    if (!routing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable)
      )
        return;
      if (event.key === 'Escape') {
        setDraft(null);
        onCancelHarnessRoute();
      } else if (routingHarnessId && event.key === 'Backspace')
        setHarnessDraft((current) => {
          if (!current) return null;
          if (current.trunkPoints.length)
            return {
              ...current,
              trunkPoints: current.trunkPoints.slice(0, -1),
            };
          if (current.target) return { ...current, target: undefined };
          return { ...current, source: undefined };
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
  const edges = useMemo<Edge[]>(() => {
    const visibleWires = project.wires.filter(
      (wire) =>
        !wire.harnessId ||
        !project.harnesses.find((harness) => harness.id === wire.harnessId)
          ?.collapsed,
    );
    const wireEdges = visibleWires.map((wire) => ({
      id: wire.id,
      source: wire.source.deviceId,
      sourceHandle: wire.source.terminalId,
      target: wire.target.deviceId,
      targetHandle: wire.target.terminalId,
      type: 'routed',
      data: {
        routePoints:
          dragging?.wireId === wire.id
            ? (wire.routePoints ?? []).map((point, index) =>
                index === dragging.pointIndex ? dragging.point : point,
              )
            : (wire.routePoints ?? []),
      },
      interactionWidth: 16,
      label:
        project.viewPreferences?.showLabels === false
          ? undefined
          : [wire.number, wire.name].filter(Boolean).join(' · ') || undefined,
      style: {
        stroke: wire.color || '#64748b',
        strokeWidth: wire.harnessId ? 2.5 : 2,
      },
      selected: wire.id === selectedWireId || multiWireIds.includes(wire.id),
    }));
    const harnessEdges = project.harnesses
      .filter((harness) => harness.collapsed)
      .flatMap((harness) => {
        const wires = project.wires.filter(
          (wire) => wire.harnessId === harness.id,
        );
        if (!wires.length) return [];
        const first = wires[0];
        const geometry = collapsedHarnessGeometry(project, harness.id);
        if (!geometry) return [];
        return [
          {
            id: `harness:${harness.id}`,
            source: first.source.deviceId,
            sourceHandle: first.source.terminalId,
            target: first.target.deviceId,
            targetHandle: first.target.terminalId,
            type: 'harness',
            data: geometry,
            label:
              project.viewPreferences?.showLabels === false
                ? undefined
                : `${harness.number || harness.name} · ${wires.length} 芯`,
            style: { stroke: harness.color, strokeWidth: 5 },
            selected: harness.id === selectedHarnessId,
          },
        ];
      });
    return [...wireEdges, ...harnessEdges];
  }, [
    project.wires,
    project.harnesses,
    project.devices,
    project.viewPreferences,
    selectedWireId,
    multiWireIds,
    selectedHarnessId,
    dragging,
  ]);

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
    let next: HarnessRoute;
    if (kind === 'sourceJunction' || kind === 'targetJunction') {
      if (!point) return;
      next = { ...route, [kind]: point };
    } else if (kind === 'trunk') {
      const trunkPoints = [...route.trunkPoints];
      if (index === undefined) return;
      if (point) trunkPoints.splice(index, insert ? 0 : 1, point);
      else trunkPoints.splice(index, 1);
      next = { ...route, trunkPoints };
    } else {
      next = {
        ...route,
        branches: route.branches.map((branch) => {
          if (branch.wireId !== wireId) return branch;
          const key = kind === 'source' ? 'sourcePoints' : 'targetPoints';
          const points = [...branch[key]];
          if (index === undefined) return branch;
          if (point) points.splice(index, insert ? 0 : 1, point);
          else points.splice(index, 1);
          return { ...branch, [key]: points };
        }),
      };
    }
    onUpdateHarnessRoute(harnessId, next);
  }

  function completeHarnessDraft() {
    if (!routingHarnessId || !harnessDraft?.source || !harnessDraft.target)
      return;
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
      sourceJunction: harnessDraft.source,
      targetJunction: harnessDraft.target,
      trunkPoints: harnessDraft.trunkPoints,
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
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
      onPointerMove={(event) => {
        if (routingHarnessId && harnessDraft && !harnessDragging) {
          const cursor = snapPointToGrid(
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
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
        panOnDrag={!routing}
        nodesDraggable={!routing}
        zoomOnDoubleClick={!routing}
        onNodeClick={(_, node) => {
          setMultiWireIds([]);
          onSelectWire(null);
          onSelectHarness(null);
          onSelectDevice(node.id);
        }}
        onEdgeClick={(event, edge) => {
          setMenu(null);
          if (routingHarnessId) return;
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
          if (edge.id.startsWith('harness:')) onToggleHarness(edge.id.slice(8));
          else {
            const wire = project.wires.find((item) => item.id === edge.id);
            if (wire?.harnessId) onToggleHarness(wire.harnessId);
          }
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          const position = menuAt(event.clientX, event.clientY);
          if (edge.id.startsWith('harness:')) {
            onSelectDevice(null);
            onSelectWire(null);
            onSelectHarness(edge.id.slice(8));
            const harnessId = edge.id.slice(8);
            const geometry = collapsedHarnessGeometry(project, harnessId);
            const clickPoint = screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            });
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
              insertPoint: snapPointToGrid(clickPoint),
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
          if (routingHarnessId) {
            const point = snapPointToGrid(
              screenToFlowPosition({ x: event.clientX, y: event.clientY }),
            );
            setHarnessDraft((current) => {
              const next = current ?? { trunkPoints: [] };
              if (!next.source) return { ...next, source: point };
              if (!next.target) return { ...next, target: point };
              return { ...next, trunkPoints: [...next.trunkPoints, point] };
            });
            return;
          }
          if (draft) {
            if (event.detail < 2) addDraftPoint(event.clientX, event.clientY);
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
          {previewPoints.length > 1 && (
            <svg className="wire-route-preview" aria-hidden="true">
              <path
                d={previewPoints
                  .map(
                    (point, index) =>
                      `${index ? 'L' : 'M'}${point.x} ${point.y}`,
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
                          <path
                            d={wirePath(source, harnessDraft.source!).path}
                          />
                        )}
                        {target && harnessDraft.target && (
                          <path
                            d={wirePath(target, harnessDraft.target).path}
                          />
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
                            wireId:
                              'wireId' in marker ? marker.wireId : undefined,
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
                      ...(selectedWire.routePoints ?? []).slice(
                        menu.insertIndex,
                      ),
                    ]).path
                  }
                />
              </svg>
            )}
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
            ? '点击网格设置起点汇合点'
            : !harnessDraft.target
              ? '点击网格设置终点汇合点'
              : '继续点击可添加主干路径点；完成后可编辑各分支'}
          <button
            type="button"
            disabled={!harnessDraft?.source || !harnessDraft.target}
            onClick={completeHarnessDraft}
          >
            完成线束走线
          </button>
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
      {menu && (
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
                const wire = project.wires.find(
                  (item) => item.id === menu.wireId,
                );
                if (wire)
                  onUpdateWireRoute(
                    wire.id,
                    (wire.routePoints ?? []).filter(
                      (_, index) => index !== menu?.pointIndex,
                    ),
                  );
                setMenu(null);
              }}
            >
              删除路径点
            </button>
          ) : menu.wireId ? (
            <>
              {multiWireIds.length >= 2 &&
                multiWireIds.includes(menu.wireId) && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCreateHarness(multiWireIds);
                      setMenu(null);
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
                  if (
                    wire &&
                    menu.insertPoint &&
                    menu.insertIndex !== undefined
                  ) {
                    const next = [...(wire.routePoints ?? [])];
                    next.splice(menu.insertIndex, 0, menu.insertPoint);
                    onUpdateWireRoute(wire.id, next);
                  }
                  setMenu(null);
                }}
              >
                添加路径点
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setMenu(null)}
              >
                编辑导线属性
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onDeleteWire(menu.wireId!);
                  setMenu(null);
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
                    setMenu(null);
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
                      setMenu(null);
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
                  setMenu(null);
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
      )}
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
