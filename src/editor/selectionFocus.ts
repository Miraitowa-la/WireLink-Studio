import type { Project, Wire } from '../model/project';

export type FocusSelection = {
  kind: 'device' | 'wire' | 'harness';
  id: string;
};

export type FocusRelations = {
  devices: Set<string>;
  wires: Set<string>;
  harnesses: Set<string>;
};

export function relatedObjects(
  project: Project,
  selection: FocusSelection | null,
): FocusRelations | null {
  if (!selection) return null;
  const related: FocusRelations = {
    devices: new Set(),
    wires: new Set(),
    harnesses: new Set(),
  };
  const addWire = (wire: Wire) => {
    related.wires.add(wire.id);
    related.devices.add(wire.source.deviceId);
    related.devices.add(wire.target.deviceId);
    if (wire.harnessId) related.harnesses.add(wire.harnessId);
  };
  if (selection.kind === 'device') {
    if (!project.devices.some((device) => device.id === selection.id))
      return null;
    related.devices.add(selection.id);
    project.wires
      .filter((wire) =>
        [wire.source.deviceId, wire.target.deviceId].includes(selection.id),
      )
      .forEach(addWire);
  } else if (selection.kind === 'wire') {
    const wire = project.wires.find((item) => item.id === selection.id);
    if (!wire) return null;
    addWire(wire);
  } else {
    if (!project.harnesses.some((harness) => harness.id === selection.id))
      return null;
    related.harnesses.add(selection.id);
    project.wires
      .filter((wire) => wire.harnessId === selection.id)
      .forEach(addWire);
  }
  return related;
}
