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
  conductor: string;
  source: string;
  target: string;
  status: string;
  note: string;
  wireId?: string;
}

export interface WireRow {
  id: string;
  sourceDevice: string;
  sourceTerminal: string;
  targetDevice: string;
  targetTerminal: string;
  number: string;
  name: string;
  harness: string;
  harnessNumber: string;
  note: string;
}

export const wireListColumns: { key: keyof WireRow; label: string }[] = [
  { key: 'sourceDevice', label: '从设备' },
  { key: 'sourceTerminal', label: '从端子' },
  { key: 'targetDevice', label: '到设备' },
  { key: 'targetTerminal', label: '到端子' },
  { key: 'number', label: '线号' },
  { key: 'name', label: '导线名称' },
  { key: 'harness', label: '所属线束' },
  { key: 'harnessNumber', label: '线束编号' },
  { key: 'note', label: '备注' },
];

export function wireRows(project: Project): WireRow[] {
  return project.wires.map((wire) => {
    const source = endpointInfo(project, wire.source);
    const target = endpointInfo(project, wire.target);
    const harness = project.harnesses.find(
      (item) => item.id === wire.harnessId,
    );
    return {
      id: wire.id,
      sourceDevice: source.device?.name ?? wire.source.deviceId,
      sourceTerminal: source.terminal?.label ?? wire.source.terminalId,
      targetDevice: target.device?.name ?? wire.target.deviceId,
      targetTerminal: target.terminal?.label ?? wire.target.terminalId,
      number: wire.number ?? '',
      name: wire.name ?? '',
      harness: harness?.name ?? wire.harnessId ?? '',
      harnessNumber: harness?.number ?? '',
      note: wire.note ?? '',
    };
  });
}

export function harnessRows(project: Project): HarnessRow[] {
  return project.harnesses.flatMap((harness) =>
    project.wires
      .filter((wire) => wire.harnessId === harness.id)
      .map((wire) => {
        const source = endpointInfo(project, wire.source);
        const target = endpointInfo(project, wire.target);
        return {
          id: wire.id,
          harnessId: harness.id,
          number: harness.number || harness.name,
          conductor: wire.name || wire.number || '未命名导线',
          source: `${source.device?.name ?? '未知设备'} / ${source.terminal?.label ?? '未知端子'}`,
          target: `${target.device?.name ?? '未知设备'} / ${target.terminal?.label ?? '未知端子'}`,
          status: source.terminal && target.terminal ? '正常' : '端子缺失',
          note: wire.note || harness.note || '',
          wireId: wire.id,
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
        conductor: wire.name ?? '',
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
    if (mapped.length < 2)
      add(
        'error',
        `${harness.id}:count`,
        `线束“${harness.name}”少于两根芯线`,
        mapped[0]?.id,
      );
    const pair =
      mapped[0] &&
      [mapped[0].source.deviceId, mapped[0].target.deviceId].sort().join('\0');
    if (
      mapped.some(
        (wire) =>
          [wire.source.deviceId, wire.target.deviceId].sort().join('\0') !==
          pair,
      )
    )
      add(
        'error',
        `${harness.id}:devices`,
        `线束“${harness.name}”的芯线未连接同一对设备`,
        mapped[0]?.id,
      );
    if (harness.collapsed && !harness.route)
      add(
        'error',
        `${harness.id}:route`,
        `线束“${harness.name}”缺少走线路径`,
        mapped[0]?.id,
      );
    if (
      harness.route &&
      (harness.route.branches.length !== mapped.length ||
        mapped.some(
          (wire) =>
            !harness.route?.branches.some(
              (branch) => branch.wireId === wire.id,
            ),
        ))
    )
      add(
        'error',
        `${harness.id}:branches`,
        `线束“${harness.name}”的分支与芯线不一致`,
        mapped[0]?.id,
      );
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
  return csvRows(
    [
      '设备',
      '端子',
      '端子类型',
      '所在边',
      '连接对象',
      '线号',
      '线束编号',
      '芯线名称',
    ],
    rows.map((row) => columns.map((column) => row[column])),
  );
}

export function csvForWireRows(rows: WireRow[]): string {
  return csvRows(
    wireListColumns.map((column) => column.label),
    rows.map((row) => wireListColumns.map((column) => row[column.key])),
  );
}

export function csvForHarnessRows(rows: HarnessRow[]): string {
  return csvRows(
    ['线束编号', '芯线', '源设备/端子', '目标设备/端子', '状态', '备注'],
    rows.map((row) => [
      row.number,
      row.conductor,
      row.source,
      row.target,
      row.status,
      row.note,
    ]),
  );
}

function csvRows(headers: string[], rows: string[][]): string {
  const escape = (value: string) => {
    const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  );
}
