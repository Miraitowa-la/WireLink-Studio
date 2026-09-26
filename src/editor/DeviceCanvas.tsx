import { useEffect, useMemo, type DragEvent } from 'react';
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
  useNodesState,
  useReactFlow,
  type Connection,
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
import { getDeviceSize, SIDES } from './device';

export const TEMPLATE_DRAG_TYPE = 'application/wirelink-device-template';

type DeviceFlowNode = Node<
  {
    device: DeviceInstance;
    terminalTypes: TerminalType[];
    imageAsset?: ImageAsset;
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
  const { device, terminalTypes, imageAsset } = data;
  const { width, height } = getDeviceSize(device);
  const terminals = device.templateSnapshot.terminals;
  const colors = new Map(terminalTypes.map((type) => [type.id, type.color]));

  return (
    <div
      className={`device-node${selected ? ' device-node-selected' : ''}`}
      style={{ width, height }}
    >
      <div className="device-node-center">
        {device.templateSnapshot.appearance.kind === 'image' && imageAsset && (
          <img
            className="device-node-image"
            src={imageAsset.data}
            alt=""
            style={{
              objectFit:
                device.templateSnapshot.appearance.imageFit ?? 'contain',
            }}
          />
        )}
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
          const fraction = `${((index + 1) / (onSide.length + 1)) * 100}%`;
          const style =
            side === 'top' || side === 'bottom'
              ? { left: fraction }
              : { top: fraction };
          return (
            <div key={terminal.id}>
              <Handle
                type="source"
                id={terminal.id}
                position={positions[side]}
                isConnectable
                className="terminal-handle"
                style={{
                  ...style,
                  backgroundColor: colors.get(terminal.typeId) ?? '#64748b',
                }}
                title={`${terminal.label} · ${terminalTypes.find((type) => type.id === terminal.typeId)?.name ?? terminal.typeId}`}
              />
              <span
                className={`terminal-label terminal-label-${side}`}
                style={style}
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
type RoutedEdge = Edge<{ routePoints: { x: number; y: number }[] }, 'routed'>;

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
  const points = [
    { x: sourceX, y: sourceY },
    ...(data?.routePoints ?? []),
    { x: targetX, y: targetY },
  ];
  const path = points
    .slice(1)
    .reduce(
      (value, point, index) =>
        `${value} L ${point.x},${points[index].y} L ${point.x},${point.y}`,
      `M ${sourceX},${sourceY}`,
    );
  const middle = points[Math.floor(points.length / 2)];
  return (
    <BaseEdge
      path={path}
      labelX={middle.x}
      labelY={middle.y}
      label={label}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
const edgeTypes = { routed: RoutedEdge };

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
  onConnect(source: WireEndpoint, target: WireEndpoint): void;
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
  onAddDevice,
  onMoveDevice,
}: CanvasProps) {
  const { screenToFlowPosition, fitView, setCenter } = useReactFlow();
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
        },
      })),
    [project.devices, project.terminalTypes, project.assets, selectedDeviceId],
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
      type: wire.routePoints?.length ? 'routed' : 'step',
      data: wire.routePoints?.length
        ? { routePoints: wire.routePoints }
        : undefined,
      pathOptions: wire.harnessId
        ? {
            offset:
              20 +
              project.wires
                .filter((item) => item.harnessId === wire.harnessId)
                .findIndex((item) => item.id === wire.id) *
                16,
          }
        : undefined,
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
        return [
          {
            id: `harness:${harness.id}`,
            source: first.source.deviceId,
            sourceHandle: first.source.terminalId,
            target: first.target.deviceId,
            targetHandle: first.target.terminalId,
            type: harness.routePoints?.length ? 'routed' : 'step',
            data: harness.routePoints?.length
              ? { routePoints: harness.routePoints }
              : undefined,
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
    project.viewPreferences,
    selectedWireId,
    selectedHarnessId,
  ]);

  function connect(connection: Connection) {
    if (!connection.sourceHandle || !connection.targetHandle) return;
    onConnect(
      { deviceId: connection.source, terminalId: connection.sourceHandle },
      { deviceId: connection.target, terminalId: connection.targetHandle },
    );
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
      className="canvas-wrap"
      onDrop={onDrop}
      onDragOver={(event) => event.preventDefault()}
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
        onNodeClick={(_, node) => {
          onSelectWire(null);
          onSelectHarness(null);
          onSelectDevice(node.id);
        }}
        onEdgeClick={(_, edge) => {
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
        onPaneClick={() => {
          onSelectDevice(null);
          onSelectWire(null);
          onSelectHarness(null);
        }}
        onNodeDragStop={(_, node) => onMoveDevice(node.id, node.position)}
        onConnect={connect}
        deleteKeyCode={null}
        ariaLabelConfig={{
          'node.a11yDescription.default': '按回车选择设备，方向键移动设备',
        }}
      >
        <Background gap={24} color="#dbe4ed" />
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
