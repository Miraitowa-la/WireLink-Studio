import type { Project } from '../model/project';
import { pruneAssets } from './assets';

export function removeDevice(project: Project, deviceId: string): Project {
  if (!project.devices.some((device) => device.id === deviceId)) return project;
  const removedHarnesses = new Set(
    project.wires
      .filter(
        (wire) =>
          wire.source.deviceId === deviceId ||
          wire.target.deviceId === deviceId,
      )
      .map((wire) => wire.harnessId)
      .filter((id): id is string => !!id),
  );
  return pruneAssets({
    ...project,
    devices: project.devices.filter((device) => device.id !== deviceId),
    wires: project.wires.filter(
      (wire) =>
        wire.source.deviceId !== deviceId &&
        wire.target.deviceId !== deviceId &&
        !removedHarnesses.has(wire.harnessId ?? ''),
    ),
    harnesses: project.harnesses.filter(
      (harness) => !removedHarnesses.has(harness.id),
    ),
  });
}

export function removeTerminalType(project: Project, typeId: string): Project {
  const type = project.terminalTypes.find((item) => item.id === typeId);
  if (!type) return project;
  if (
    project.deviceLibrary.some((template) =>
      template.terminals.some((terminal) => terminal.typeId === typeId),
    ) ||
    project.devices.some((device) =>
      device.templateSnapshot.terminals.some(
        (terminal) => terminal.typeId === typeId,
      ),
    )
  )
    throw new Error(`端子类型“${type.name}”仍被设备引用，不能删除`);
  return {
    ...project,
    terminalTypes: project.terminalTypes
      .filter((item) => item.id !== typeId)
      .map((item) => ({
        ...item,
        compatibleTypeIds: item.compatibleTypeIds.filter((id) => id !== typeId),
      })),
  };
}
