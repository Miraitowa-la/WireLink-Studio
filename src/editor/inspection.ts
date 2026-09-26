import type { Project, WireEndpoint } from '../model/project';

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  deviceId?: string;
  wireId?: string;
}

export interface TerminalRow {
  id: string;
  device: string;
  terminal: string;
  type: string;
  side: string;
  connectedTo: string;
  number: string;
  harnessNumber: string;
  conductor: string;
  wireId: string;
}

export interface HarnessRow {
  id: string;
  harnessId: string;
  number: string;
  template: string;
  conductor: string;
  source: string;
  target: string;
  status: string;
  note: string;
  wireId?: string;
}

export function harnessRows(project: Project): HarnessRow[] {
  return project.harnesses.flatMap((harness) =>
    harness.templateSnapshot.conductors.map((conductor) => {
      const wire = project.wires.find(
        (item) =>
          item.harnessId === harness.id && item.conductorId === conductor.id,
      );
      const source = wire && endpointInfo(project, wire.source);
      const target = wire && endpointInfo(project, wire.target);
      return {
        id: `${harness.id}:${conductor.id}`,
        harnessId: harness.id,
        number: harness.number || harness.name,
        template: harness.templateSnapshot.name,
        conductor: conductor.name,
        source: source
          ? `${source.device?.name ?? '未知设备'} / ${source.terminal?.label ?? '未知端子'}`
          : '—',
        target: target
          ? `${target.device?.name ?? '未知设备'} / ${target.terminal?.label ?? '未知端子'}`
          : '—',
        status: !wire
          ? conductor.required
            ? '缺失'
            : '未连接'
          : source?.terminal &&
              target?.terminal &&
              source.terminal.typeId === conductor.terminalTypeId &&
              target.terminal.typeId === conductor.terminalTypeId
            ? '正常'
            : '类型不匹配',
        note: wire?.note || harness.note || '',
        wireId: wire?.id,
      };
    }),
  );
}

function endpointKey(endpoint: WireEndpoint): string {
  return `${endpoint.deviceId}\0${endpoint.terminalId}`;
}

function endpointInfo(project: Project, endpoint: WireEndpoint) {
  const device = project.devices.find((item) => item.id === endpoint.deviceId);
  const terminal = device?.templateSnapshot.terminals.find(
    (item) => item.id === endpoint.terminalId,
  );
  const type = project.terminalTypes.find(
    (item) => item.id === terminal?.typeId,
  );
  return { device, terminal, type };
}

export function terminalRows(project: Project): TerminalRow[] {
  return project.wires.flatMap((wire) => {
    const harness = project.harnesses.find(
      (item) => item.id === wire.harnessId,
    );
    const conductor = harness?.templateSnapshot.conductors.find(
      (item) => item.id === wire.conductorId,
    );
    return ([wire.source, wire.target] as const).map((endpoint, index) => {
      const own = endpointInfo(project, endpoint);
      const other = endpointInfo(
        project,
        index === 0 ? wire.target : wire.source,
      );
      return {
        id: `${wire.id}:${index}`,
        device: own.device?.name ?? endpoint.deviceId,
        terminal: own.terminal?.label ?? endpoint.terminalId,
        type: own.type?.name ?? own.terminal?.typeId ?? '—',
        side: own.terminal?.side ?? '—',
        connectedTo: `${other.device?.name ?? (index === 0 ? wire.target.deviceId : wire.source.deviceId)} / ${other.terminal?.label ?? (index === 0 ? wire.target.terminalId : wire.source.terminalId)}`,
        number: wire.number ?? '',
        harnessNumber: harness?.number ?? '',
        conductor: conductor?.name ?? '',
        wireId: wire.id,
      };
    });
  });
}

export function inspectProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (
    severity: ValidationIssue['severity'],
    id: string,
    message: string,
    wireId?: string,
    deviceId?: string,
  ) => issues.push({ id, severity, message, wireId, deviceId });
  const used = new Map<string, number>();
  const pairs = new Set<string>();

  for (const wire of project.wires) {
    const source = endpointInfo(project, wire.source);
    const target = endpointInfo(project, wire.target);
    for (const [endpoint, info] of [
      [wire.source, source],
      [wire.target, target],
    ] as const) {
      if (!info.device || !info.terminal) {
        add(
          'error',
          `${wire.id}:missing:${endpointKey(endpoint)}`,
          `导线引用不存在的设备或端子：${endpoint.deviceId} / ${endpoint.terminalId}`,
          wire.id,
        );
      } else {
        const key = endpointKey(endpoint);
        used.set(key, (used.get(key) ?? 0) + 1);
        if (!info.type)
          add(
            'error',
            `${wire.id}:type:${key}`,
            `端子“${info.terminal.label}”的类型不存在`,
            wire.id,
          );
      }
    }
    if (
      source.type &&
      target.type &&
      (!source.type.compatibleTypeIds.includes(target.type.id) ||
        !target.type.compatibleTypeIds.includes(source.type.id))
    )
      add(
        'error',
        `${wire.id}:incompatible`,
        `导线“${wire.number || wire.name || wire.id}”两端类型不兼容`,
        wire.id,
      );

    const pair = [endpointKey(wire.source), endpointKey(wire.target)]
      .sort()
      .join('\u0001');
    if (pairs.has(pair))
      add('error', `${wire.id}:duplicate`, '存在重复的端子连接', wire.id);
    else pairs.add(pair);

    if (
      wire.harnessId &&
      !project.harnesses.some((item) => item.id === wire.harnessId)
    )
      add(
        'error',
        `${wire.id}:harness`,
        `导线引用不存在的线束：${wire.harnessId}`,
        wire.id,
      );
  }

  for (const device of project.devices) {
    for (const terminal of device.templateSnapshot.terminals) {
      const count =
        used.get(
          endpointKey({ deviceId: device.id, terminalId: terminal.id }),
        ) ?? 0;
      if (terminal.maxConnections !== null && count > terminal.maxConnections)
        add(
          'error',
          `${device.id}:${terminal.id}:capacity`,
          `“${device.name} / ${terminal.label}”连接数 ${count} 超过上限 ${terminal.maxConnections}`,
          undefined,
          device.id,
        );
    }
  }

  for (const field of ['number', 'name'] as const) {
    const seen = new Set<string>();
    for (const wire of project.wires) {
      const value = wire[field]?.trim();
      if (!value) continue;
      if (seen.has(value))
        add(
          'warning',
          `${wire.id}:${field}`,
          `导线${field === 'number' ? '线号' : '名称'}重复：${value}`,
          wire.id,
        );
      else seen.add(value);
    }
    seen.clear();
    for (const harness of project.harnesses) {
      const value = harness[field]?.trim();
      if (!value) continue;
      if (seen.has(value))
        add(
          'warning',
          `${harness.id}:${field}`,
          `线束${field === 'number' ? '编号' : '名称'}重复：${value}`,
          project.wires.find((wire) => wire.harnessId === harness.id)?.id,
        );
      else seen.add(value);
    }
  }

  for (const harness of project.harnesses) {
    const mapped = project.wires.filter(
      (wire) => wire.harnessId === harness.id,
    );
    for (const conductor of harness.templateSnapshot.conductors) {
      const matches = mapped.filter(
        (wire) => wire.conductorId === conductor.id,
      );
      if (conductor.required && matches.length === 0)
        add(
          'error',
          `${harness.id}:${conductor.id}:missing`,
          `线束“${harness.name}”缺少必需芯线“${conductor.name}”`,
          mapped[0]?.id,
        );
      if (matches.length > 1)
        add(
          'error',
          `${harness.id}:${conductor.id}:duplicate`,
          `线束“${harness.name}”芯线“${conductor.name}”被重复映射`,
          matches[1].id,
        );
      for (const wire of matches) {
        const source = endpointInfo(project, wire.source).terminal;
        const target = endpointInfo(project, wire.target).terminal;
        if (
          source &&
          target &&
          (source.typeId !== conductor.terminalTypeId ||
            target.typeId !== conductor.terminalTypeId)
        )
          add(
            'error',
            `${wire.id}:conductor-type`,
            `芯线“${conductor.name}”端子类型不匹配`,
            wire.id,
          );
      }
    }
    for (const wire of mapped) {
      if (
        !harness.templateSnapshot.conductors.some(
          (item) => item.id === wire.conductorId,
        )
      )
        add(
          'error',
          `${wire.id}:conductor`,
          `导线引用不存在的线束芯线：${wire.conductorId ?? '未指定'}`,
          wire.id,
        );
    }
  }
  return issues;
}

export function csvForTerminalRows(rows: TerminalRow[]): string {
  const columns: (keyof TerminalRow)[] = [
    'device',
    'terminal',
    'type',
    'side',
    'connectedTo',
    'number',
    'harnessNumber',
    'conductor',
  ];
  const escape = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      [
        '设备',
        '端子',
        '端子类型',
        '所在边',
        '连接对象',
        '线号',
        '线束编号',
        '芯线名称',
      ]
        .map(escape)
        .join(','),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(','),
      ),
    ].join('\r\n')
  );
}
