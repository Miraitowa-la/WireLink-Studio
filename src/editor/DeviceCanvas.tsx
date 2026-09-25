import { useEffect, useMemo, type DragEvent } from 'react';
import {
  Background,
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
  type Node,
  type NodeProps,
} from '@xyflow/react';
import type {
  DeviceInstance,
  Project,
  Side,
  TerminalType,
  WireEndpoint,
} from '../model/project';
import { getDeviceSize, SIDES } from './device';

export const TEMPLATE_DRAG_TYPE = 'application/wirelink-device-template';

type DeviceFlowNode = Node<
  { device: DeviceInstance; terminalTypes: TerminalType[] },
  'device'
>;

const positions: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
};

function DeviceNode({ data, selected }: NodeProps<DeviceFlowNode>) {
  const { device, terminalTypes } = data;
  const { width, height } = getDeviceSize(device);
  const terminals = device.templateSnapshot.terminals;
  const colors = new Map(terminalTypes.map((type) => [type.id, type.color]));

  return (
    <div
      className={`device-node${selected ? ' device-node-selected' : ''}`}
      style={{ width, height }}
    >
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

interface CanvasProps {
  project: Project;
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  onSelectDevice(id: string | null): void;
  onSelectWire(id: string | null): void;
  onConnect(source: WireEndpoint, target: WireEndpoint): void;
  onAddDevice(templateId: string, position: { x: number; y: number }): void;
  onMoveDevice(id: string, position: { x: number; y: number }): void;
}

function Canvas({
  project,
  selectedDeviceId,
  selectedWireId,
  onSelectDevice,
  onSelectWire,
  onConnect,
  onAddDevice,
  onMoveDevice,
}: CanvasProps) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const projectNodes = useMemo<DeviceFlowNode[]>(
    () =>
      project.devices.map((device) => ({
        id: device.id,
        type: 'device',
        position: device.position,
        selected: selectedDeviceId === device.id,
        data: { device, terminalTypes: project.terminalTypes },
      })),
    [project.devices, project.terminalTypes, selectedDeviceId],
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
  const edges = useMemo<Edge[]>(
    () =>
      project.wires.map((wire) => ({
        id: wire.id,
        source: wire.source.deviceId,
        sourceHandle: wire.source.terminalId,
        target: wire.target.deviceId,
        targetHandle: wire.target.terminalId,
        type:
          project.viewPreferences?.wireStyle === 'orthogonal'
            ? 'step'
            : 'default',
        label:
          project.viewPreferences?.showLabels === false
            ? undefined
            : [wire.number, wire.name].filter(Boolean).join(' · ') || undefined,
        style: { stroke: wire.color || '#64748b', strokeWidth: 2 },
        selected: wire.id === selectedWireId,
      })),
    [project.wires, project.viewPreferences, selectedWireId],
  );

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
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        onNodeClick={(_, node) => {
          onSelectWire(null);
          onSelectDevice(node.id);
        }}
        onEdgeClick={(_, edge) => {
          onSelectDevice(null);
          onSelectWire(edge.id);
        }}
        onPaneClick={() => {
          onSelectDevice(null);
          onSelectWire(null);
        }}
        onNodeDragStop={(_, node) => onMoveDevice(node.id, node.position)}
        onConnect={connect}
        deleteKeyCode={null}
        ariaLabelConfig={{
          'node.a11yDescription.default': '按回车选择设备，方向键移动设备',
        }}
      >
        <Background gap={24} color="#dbe4ed" />
        <MiniMap pannable zoomable />
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
