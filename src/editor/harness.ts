import type {
  HarnessTemplate,
  Project,
  TerminalType,
  WireEndpoint,
} from '../model/project';
import { addWire } from './wire';

export type ConductorMapping = {
  conductorId: string;
  sourceTerminalId: string;
  targetTerminalId: string;
};

export function createHarnessTemplate(typeId = ''): HarnessTemplate {
  return {
    id: crypto.randomUUID(),
    name: '新线束模板',
    color: '#0f766e',
    conductors: typeId
      ? [
          {
            id: crypto.randomUUID(),
            name: '芯线 1',
            terminalTypeId: typeId,
            required: true,
            order: 0,
          },
        ]
      : [],
  };
}

export function installHarnessPresets(project: Project): Project {
  let types = [...project.terminalTypes];
  const ensureType = (name: string): TerminalType => {
    const existing = types.find((type) => type.name === name);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const value: TerminalType = {
      id,
      name,
      color: '#0f766e',
      compatibleTypeIds: [id],
    };
    types = [...types, value];
    return value;
  };
  const presets = [
    {
      name: 'SPI-4',
      color: '#7c3aed',
      conductors: ['SPI-MOSI', 'SPI-MISO', 'SPI-SCLK', 'SPI-CS'],
    },
    { name: 'RS485-2', color: '#0f766e', conductors: ['RS485-A', 'RS485-B'] },
  ];
  const library = [...project.harnessLibrary];
  for (const preset of presets) {
    if (library.some((template) => template.name === preset.name)) continue;
    library.push({
      id: crypto.randomUUID(),
      name: preset.name,
      color: preset.color,
      conductors: preset.conductors.map((name, order) => ({
        id: crypto.randomUUID(),
        name,
        terminalTypeId: ensureType(name).id,
        required: true,
        order,
      })),
    });
  }
  return { ...project, terminalTypes: types, harnessLibrary: library };
}

export function createHarnessConnection(
  project: Project,
  template: HarnessTemplate,
  sourceDeviceId: string,
  targetDeviceId: string,
  mappings: ConductorMapping[],
  details: {
    name: string;
    number: string;
    note: string;
    cableModel: string;
    shielded: boolean;
  },
): Project {
  if (!details.name.trim()) throw new Error('请填写线束名称');
  if (sourceDeviceId === targetDeviceId) throw new Error('请选择两台不同设备');
  const source = project.devices.find((device) => device.id === sourceDeviceId);
  const target = project.devices.find((device) => device.id === targetDeviceId);
  if (!source || !target) throw new Error('线束两端设备不存在');
  if (!template.conductors.length) throw new Error('线束模板没有芯线');
  const harnessId = crypto.randomUUID();
  let next = project;
  for (const conductor of [...template.conductors].sort(
    (a, b) => a.order - b.order,
  )) {
    const mapping = mappings.find((item) => item.conductorId === conductor.id);
    if (!mapping?.sourceTerminalId || !mapping.targetTerminalId) {
      if (conductor.required)
        throw new Error(`芯线“${conductor.name}”尚未匹配两端端子`);
      continue;
    }
    const sourceTerminal = source.templateSnapshot.terminals.find(
      (item) => item.id === mapping.sourceTerminalId,
    );
    const targetTerminal = target.templateSnapshot.terminals.find(
      (item) => item.id === mapping.targetTerminalId,
    );
    if (
      sourceTerminal?.typeId !== conductor.terminalTypeId ||
      targetTerminal?.typeId !== conductor.terminalTypeId
    )
      throw new Error(`芯线“${conductor.name}”的端子类型不匹配`);
    const from: WireEndpoint = {
      deviceId: sourceDeviceId,
      terminalId: mapping.sourceTerminalId,
    };
    const to: WireEndpoint = {
      deviceId: targetDeviceId,
      terminalId: mapping.targetTerminalId,
    };
    try {
      next = addWire(next, from, to);
    } catch (error) {
      throw new Error(
        `芯线“${conductor.name}”：${error instanceof Error ? error.message : '无法连接'}`,
      );
    }
    next = {
      ...next,
      wires: next.wires.map((wire, index) =>
        index === next.wires.length - 1
          ? {
              ...wire,
              harnessId,
              conductorId: conductor.id,
              name: conductor.name,
              color: conductor.color ?? wire.color,
            }
          : wire,
      ),
    };
  }
  if (next.wires.length === project.wires.length)
    throw new Error('请至少匹配一条芯线');
  return {
    ...next,
    harnesses: [
      ...next.harnesses,
      {
        id: harnessId,
        templateId: template.id,
        templateSnapshot: structuredClone(template),
        name: details.name.trim(),
        number: details.number.trim(),
        note: details.note.trim(),
        cableModel: details.cableModel.trim(),
        shielded: details.shielded,
        collapsed: true,
      },
    ],
  };
}

export function autoMatchHarness(
  project: Project,
  template: HarnessTemplate,
  sourceDeviceId: string,
  targetDeviceId: string,
): ConductorMapping[] {
  const source = project.devices.find((device) => device.id === sourceDeviceId);
  const target = project.devices.find((device) => device.id === targetDeviceId);
  const usedSource = new Set<string>();
  const usedTarget = new Set<string>();
  return template.conductors.map((conductor) => {
    const find = (device: typeof source, used: Set<string>) => {
      const options =
        device?.templateSnapshot.terminals.filter(
          (item) =>
            item.typeId === conductor.terminalTypeId && !used.has(item.id),
        ) ?? [];
      const match =
        options.find(
          (item) =>
            item.label.toLocaleLowerCase() ===
            conductor.name.toLocaleLowerCase(),
        ) ?? options[0];
      if (match) used.add(match.id);
      return match?.id ?? '';
    };
    return {
      conductorId: conductor.id,
      sourceTerminalId: find(source, usedSource),
      targetTerminalId: find(target, usedTarget),
    };
  });
}
