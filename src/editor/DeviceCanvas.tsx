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
import {
  insertionIndex,
  routeAxis,
  routeTo,
  terminalExit,
  wirePath,
  type Axis,
  type Point,
} from './wireGeometry';

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
type Draft = {
  source: WireEndpoint;
  steps: Point[][];
  axis: Axis;
  cursor: Point | null;
};
type CanvasMenu = {
  x: number;
  y: number;
  wireId?: string;
  harnessId?: string;
  pointIndex?: number;
  insertIndex?: number;
  insertPoint?: Point;
  canInsert?: boolean;
};

function terminalSide(project: Project, endpoint: WireEndpoint): Side | null {
  return (
    project.devices
      .find((device) => device.id === endpoint.deviceId)
      ?.templateSnapshot.terminals.find(
        (terminal) => terminal.id === endpoint.terminalId,
      )?.side ?? null
  );
}

type RoutedEdge = Edge<
  { routePoints: Point[]; sourceSide: Side; targetSide: Side },
  'routed'
>;

function RoutedEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  label,
  style,
  interactionWidth,
}: EdgeProps<RoutedEdge>) {
  if (!data) return null;
  const geometry = wirePath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    data.sourceSide,
    data.targetSide,
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
  { trunk: string; branches: string; label: { x: number; y: number } },
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
      <BaseEdge
        path={data.branches}
        style={{ ...style, strokeWidth: 2.5 }}
        interactionWidth={interactionWidth}
      />
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
  focusTarget: { kind: 'device' | 'wire'; id: string } | null;
  onSelectDevice(id: string | null): void;
  onSelectWire(id: string | null): void;
  onSelectHarness(id: string | null): void;
  onToggleHarness(id: string): void;
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
  focusTarget,
  onSelectDevice,
  onSelectWire,
  onSelectHarness,
  onToggleHarness,
  onConnect,
  onUpdateWireRoute,
  onDeleteWire,
  onAddDevice,
  onMoveDevice,
}: CanvasProps) {
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
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
  const routing = draft !== null;

  useEffect(() => {
    if (!routing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) ||
          event.target.isContentEditable)
      )
        return;
      if (event.key === 'Escape') setDraft(null);
      else if (event.key === 'Backspace')
        setDraft((current) =>
          current ? { ...current, steps: current.steps.slice(0, -1) } : null,
        );
      else if (event.key === 'Tab')
        setDraft((current) =>
          current
            ? { ...current, axis: current.axis === 'x' ? 'y' : 'x' }
            : null,
        );
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [routing]);

  terminalClickRef.current = (endpoint) => {
    setMenu(null);
    if (!draft) {
      const side = terminalSide(project, endpoint);
      if (!side) return;
      onSelectDevice(null);
      onSelectWire(null);
      onSelectHarness(null);
      setDraft({
        source: endpoint,
        steps: [],
        axis: routeAxis(side),
        cursor: null,
      });
      return;
    }
    if (
      endpoint.deviceId === draft.source.deviceId &&
      endpoint.terminalId === draft.source.terminalId
    )
      return;
    const source = terminalPoint(project, draft.source);
    const sourceSide = terminalSide(project, draft.source);
    const target = terminalPoint(project, endpoint);
    const targetSide = terminalSide(project, endpoint);
    if (!source || !sourceSide || !target || !targetSide) return;
    const points = draft.steps.flat();
    const last = points.at(-1) ?? terminalExit(source, sourceSide);
    const finish = routeTo(last, terminalExit(target, targetSide), draft.axis);
    const routePoints = [...points, ...finish.slice(0, -1)];
    if (onConnect(draft.source, endpoint, routePoints)) setDraft(null);
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
        sourceSide: terminalSide(project, wire.source) ?? 'right',
        targetSide: terminalSide(project, wire.target) ?? 'left',
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
      selected: wire.id === selectedWireId,
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
            style: { stroke: harness.templateSnapshot.color, strokeWidth: 5 },
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
    selectedHarnessId,
    dragging,
  ]);

  const selectedWire = project.wires.find((wire) => wire.id === selectedWireId);
  const selectedSource =
    selectedWire && terminalPoint(project, selectedWire.source);
  const selectedTarget =
    selectedWire && terminalPoint(project, selectedWire.target);
  const selectedSourceSide =
    selectedWire && terminalSide(project, selectedWire.source);
  const selectedTargetSide =
    selectedWire && terminalSide(project, selectedWire.target);
  const selectedGeometry =
    selectedWire &&
    selectedSource &&
    selectedTarget &&
    selectedSourceSide &&
    selectedTargetSide
      ? wirePath(
          selectedSource,
          selectedTarget,
          selectedSourceSide,
          selectedTargetSide,
          selectedWire.routePoints,
        )
      : null;
  const draftSource = draft && terminalPoint(project, draft.source);
  const draftSide = draft && terminalSide(project, draft.source);
  const draftPoints = draft?.steps.flat() ?? [];
  const previewPoints =
    draft && draftSource && draftSide
      ? [
          draftSource,
          terminalExit(draftSource, draftSide),
          ...draftPoints,
          ...(draft.cursor
            ? routeTo(
                draftPoints.at(-1) ?? terminalExit(draftSource, draftSide),
                draft.cursor,
                draft.axis,
              )
            : []),
        ]
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
      const side = terminalSide(project, current.source);
      if (!source || !side) return null;
      const last = current.steps.flat().at(-1) ?? terminalExit(source, side);
      const step = routeTo(last, point, current.axis);
      return step.length
        ? { ...current, steps: [...current.steps, step], cursor: point }
        : current;
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
          onSelectWire(null);
          onSelectHarness(null);
          onSelectDevice(node.id);
        }}
        onEdgeClick={(_, edge) => {
          setMenu(null);
          onSelectDevice(null);
          if (edge.id.startsWith('harness:')) {
            onSelectWire(null);
            onSelectHarness(edge.id.slice(8));
          } else {
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
            setMenu({ ...position, harnessId: edge.id.slice(8) });
            return;
          }
          const wire = project.wires.find((item) => item.id === edge.id);
          if (!wire) return;
          const source = terminalPoint(project, wire.source);
          const target = terminalPoint(project, wire.target);
          const sourceSide = terminalSide(project, wire.source);
          const targetSide = terminalSide(project, wire.target);
          if (!source || !target || !sourceSide || !targetSide) return;
          const insertPoint = snapPointToGrid(
            screenToFlowPosition({ x: event.clientX, y: event.clientY }),
          );
          const geometry = wirePath(
            source,
            target,
            sourceSide,
            targetSide,
            wire.routePoints,
          );
          onSelectDevice(null);
          onSelectHarness(null);
          onSelectWire(wire.id);
          setMenu({
            ...position,
            wireId: wire.id,
            insertPoint,
            insertIndex: insertionIndex(geometry.segments, insertPoint),
            canInsert:
              !geometry.points.some(
                (point) =>
                  point.x === insertPoint.x && point.y === insertPoint.y,
              ) &&
              geometry.segments.some(
                (segment) =>
                  insertPoint.x >= Math.min(segment.from.x, segment.to.x) &&
                  insertPoint.x <= Math.max(segment.from.x, segment.to.x) &&
                  insertPoint.y >= Math.min(segment.from.y, segment.to.y) &&
                  insertPoint.y <= Math.max(segment.from.y, segment.to.y),
              ),
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setMenu(null);
        }}
        onPaneClick={(event) => {
          setMenu(null);
          if (draft) {
            if (event.detail < 2) addDraftPoint(event.clientX, event.clientY);
            return;
          }
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
            selectedGeometry &&
            selectedSource &&
            selectedTarget &&
            selectedSourceSide &&
            selectedTargetSide && (
              <svg
                className="wire-route-preview wire-route-delete-preview"
                aria-hidden="true"
              >
                <path
                  d={
                    wirePath(
                      selectedSource,
                      selectedTarget,
                      selectedSourceSide,
                      selectedTargetSide,
                      (selectedWire.routePoints ?? []).filter(
                        (_, index) => index !== menu?.pointIndex,
                      ),
                    ).path
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
          点击网格点定路线，点击终点端子完成 · Tab 切换转角 · Backspace 撤回
          <button type="button" onClick={() => setDraft(null)}>
            取消
          </button>
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
              <button
                type="button"
                role="menuitem"
                disabled={!menu.canInsert}
                title={
                  menu.canInsert
                    ? '在此网格点添加路径点'
                    : '此处没有可插入的网格点，请在线段中间右键'
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
