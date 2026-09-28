import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import { snapPointToGrid } from './device';
import { terminalPoint } from './harnessGeometry';
import { wirePath } from './wireGeometry';
import DeviceCanvas from './DeviceCanvas';

test('dragging a wire label saves only its offset and right click resets it', async () => {
  const project = createEmptyProject();
  const template = {
    id: 'device',
    name: '设备',
    category: '',
    width: 180,
    height: 120,
    appearance: { kind: 'default' as const },
    terminals: [
      {
        id: 'pin',
        label: '端子',
        typeId: 'signal',
        side: 'right' as const,
        order: 0,
        maxConnections: 1,
      },
    ],
  };
  project.devices = [
    {
      id: 'a',
      name: 'A',
      position: { x: 0, y: 0 },
      templateSnapshot: template,
    },
    {
      id: 'b',
      name: 'B',
      position: { x: 360, y: 0 },
      templateSnapshot: template,
    },
  ];
  project.wires = [
    {
      id: 'wire',
      name: '端子',
      source: { deviceId: 'a', terminalId: 'pin' },
      target: { deviceId: 'b', terminalId: 'pin' },
      routePoints: [{ x: 270, y: 90 }],
    },
    ...['core-a', 'core-b'].map((id) => ({
      id,
      harnessId: 'harness',
      source: { deviceId: 'a', terminalId: 'pin' },
      target: { deviceId: 'b', terminalId: 'pin' },
    })),
  ];
  project.harnesses = [
    {
      id: 'harness',
      name: '线束',
      color: '#7045e5',
      collapsed: true,
      route: {
        sourceDeviceId: 'a',
        targetDeviceId: 'b',
        sourceJunction: { x: 240, y: 60 },
        targetJunction: { x: 300, y: 60 },
        trunkPoints: [],
        branches: ['core-a', 'core-b'].map((wireId) => ({
          wireId,
          sourcePoints: [],
          targetPoints: [],
        })),
      },
    },
  ];
  const update = vi.fn();
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  render(
    <DeviceCanvas
      project={project}
      selectedDeviceId={null}
      selectedWireId={null}
      selectedHarnessId={null}
      routingHarnessId={null}
      focusTarget={null}
      onSelectDevice={() => {}}
      onSelectWire={() => {}}
      onSelectHarness={() => {}}
      onToggleHarness={() => {}}
      onCreateHarness={() => {}}
      onCompleteHarnessRoute={() => {}}
      onCancelHarnessRoute={() => {}}
      onUpdateHarnessRoute={() => {}}
      onConnect={() => true}
      onUpdateWireRoute={() => {}}
      onUpdateLabelOffset={update}
      onDeleteWire={() => {}}
      onAddDevice={() => {}}
      onMoveDevice={() => {}}
    />,
  );
  const canvas = screen.getByLabelText('接线画布快捷键区域');
  const edge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edge.classList.add('react-flow__edge');
  edge.setAttribute('data-id', 'wire');
  const label = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  label.classList.add('react-flow__edge-textwrapper');
  edge.append(label);
  canvas.append(edge);
  fireEvent.pointerDown(label, {
    button: 0,
    pointerId: 3,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerUp(canvas, { pointerId: 3, clientX: 100, clientY: 100 });
  expect(update).not.toHaveBeenCalled();
  fireEvent.pointerDown(label, {
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(canvas, {
    pointerId: 1,
    clientX: 130,
    clientY: 80,
  });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 130, clientY: 80 });
  const wire = project.wires[0];
  const anchor = wirePath(
    terminalPoint(project, wire.source)!,
    terminalPoint(project, wire.target)!,
    wire.routePoints,
  ).label;
  const center = snapPointToGrid({ x: anchor.x + 30, y: anchor.y - 20 });
  expect(update).toHaveBeenCalledWith('wire', 'wire', {
    x: center.x - anchor.x,
    y: center.y - anchor.y,
  });
  fireEvent.contextMenu(label, { clientX: 130, clientY: 80 });
  fireEvent.click(screen.getByRole('menuitem', { name: '复位名称位置' }));
  expect(update).toHaveBeenLastCalledWith('wire', 'wire', undefined);
  expect(project.wires[0].routePoints).toEqual([{ x: 270, y: 90 }]);

  edge.setAttribute('data-id', 'harness:harness');
  fireEvent.pointerDown(label, {
    button: 0,
    pointerId: 2,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(canvas, {
    pointerId: 2,
    clientX: 115,
    clientY: 130,
  });
  fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 115, clientY: 130 });
  expect(update).toHaveBeenLastCalledWith('harness', 'harness', {
    x: 15,
    y: 30,
  });
  fireEvent.contextMenu(label, { clientX: 115, clientY: 130 });
  fireEvent.click(screen.getByRole('menuitem', { name: '复位名称位置' }));
  expect(update).toHaveBeenLastCalledWith('harness', 'harness', undefined);
});
