import {
  BaseEdge,
  Handle,
  Position,
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
import { deviceTerminalLayout, getDeviceSize } from './device';
import { collapsedHarnessGeometry } from './harnessGeometry';
import type { FocusRelations } from './selectionFocus';
import { labelPoint, wirePath, type Point } from './wireGeometry';
const mutedStroke = '#cbd9e6';
export type DeviceFlowNode = Node<
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
      {deviceTerminalLayout(device).map(({ terminal, side, count, offset }) => {
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
                ...((side === 'top' || side === 'bottom') && count === 1
                  ? { maxWidth: 66 }
                  : {}),
              }}
              title={terminal.label}
            >
              {terminal.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const nodeTypes = { device: DeviceNode };
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
type RoutedEdge = Edge<{ routePoints: Point[]; labelOffset?: Point }, 'routed'>;

function RoutedEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  data,
  label,
  labelStyle,
  labelBgStyle,
  style,
  interactionWidth,
}: EdgeProps<RoutedEdge>) {
  if (!data) return null;
  const geometry = wirePath(
    handleCenter({ x: sourceX, y: sourceY }, sourcePosition),
    handleCenter({ x: targetX, y: targetY }, targetPosition),
    data.routePoints,
  );
  const position = labelPoint(geometry.label, data.labelOffset);
  return (
    <BaseEdge
      path={geometry.path}
      labelX={position.x}
      labelY={position.y}
      label={label}
      labelStyle={labelStyle}
      labelBgStyle={labelBgStyle}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}
type HarnessEdge = Edge<
  NonNullable<ReturnType<typeof collapsedHarnessGeometry>> & {
    muted: boolean;
    labelOffset?: Point;
  },
  'harness'
>;
function HarnessEdge({
  data,
  label,
  labelStyle,
  labelBgStyle,
  style,
  interactionWidth,
}: EdgeProps<HarnessEdge>) {
  if (!data) return null;
  const position = labelPoint(data.label, data.labelOffset);
  return (
    <>
      {data.paths.slice(1).map((item, index) => (
        <BaseEdge
          key={index}
          path={item.path}
          style={{
            ...style,
            stroke: data.muted ? mutedStroke : item.color,
            strokeWidth: 2.5,
          }}
          interactionWidth={interactionWidth}
        />
      ))}
      <BaseEdge
        path={data.trunk}
        labelX={position.x}
        labelY={position.y}
        label={label}
        labelStyle={labelStyle}
        labelBgStyle={labelBgStyle}
        style={style}
        interactionWidth={interactionWidth}
      />
    </>
  );
}
export const edgeTypes = { routed: RoutedEdge, harness: HarnessEdge };

export function buildCanvasEdges(
  project: Project,
  selectedWireId: string | null,
  multiWireIds: string[],
  selectedHarnessId: string | null,
  dragging: { wireId: string; pointIndex: number; point: Point } | null,
  focus: FocusRelations | null = null,
  labelDragging: {
    kind: 'wire' | 'harness';
    id: string;
    offset: Point;
  } | null = null,
): Edge[] {
  const visibleWires = project.wires.filter(
    (wire) =>
      !wire.harnessId ||
      !project.harnesses.find((harness) => harness.id === wire.harnessId)
        ?.collapsed,
  );
  const wireEdges = visibleWires.map((wire) => {
    const muted = !!focus && !focus.wires.has(wire.id);
    return {
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
        labelOffset:
          labelDragging?.kind === 'wire' && labelDragging.id === wire.id
            ? labelDragging.offset
            : wire.labelOffset,
      },
      interactionWidth: 16,
      zIndex: focus ? (muted ? 0 : 2) : undefined,
      label:
        project.viewPreferences?.showLabels === false
          ? undefined
          : [wire.number, wire.name].filter(Boolean).join(' · ') || undefined,
      style: {
        stroke: muted ? mutedStroke : wire.color || '#64748b',
        strokeWidth: wire.harnessId ? 2.5 : 2,
      },
      labelStyle: muted ? { fill: '#8da2b5' } : undefined,
      labelBgStyle: muted ? { fill: '#f7fafc', stroke: '#dce7ef' } : undefined,
      selected: wire.id === selectedWireId || multiWireIds.includes(wire.id),
    };
  });
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
      const muted = !!focus && !focus.harnesses.has(harness.id);
      return [
        {
          id: `harness:${harness.id}`,
          source: first.source.deviceId,
          sourceHandle: first.source.terminalId,
          target: first.target.deviceId,
          targetHandle: first.target.terminalId,
          type: 'harness',
          data: {
            ...geometry,
            muted,
            labelOffset:
              labelDragging?.kind === 'harness' &&
              labelDragging.id === harness.id
                ? labelDragging.offset
                : harness.labelOffset,
          },
          zIndex: focus ? (muted ? 0 : 2) : undefined,
          label:
            project.viewPreferences?.showLabels === false
              ? undefined
              : `${harness.number || harness.name} · ${wires.length} 芯`,
          style: {
            stroke: muted ? mutedStroke : harness.color,
            strokeWidth: 5,
          },
          labelStyle: muted ? { fill: '#8da2b5' } : undefined,
          labelBgStyle: muted
            ? { fill: '#f7fafc', stroke: '#dce7ef' }
            : undefined,
          selected: harness.id === selectedHarnessId,
        },
      ];
    });
  return [...wireEdges, ...harnessEdges];
}
