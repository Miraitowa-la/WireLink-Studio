import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { createEmptyProject } from '../model/project';
import { createDeviceTemplate, createTerminal } from './device';
import InspectionPanel from './InspectionPanel';

test('wire and harness lists locate wires and export their filtered rows', async () => {
  const project = createEmptyProject('接线/项目');
  const terminal = {
    ...createTerminal('right', 'signal', 0),
    id: 'pin',
    label: 'A',
  };
  project.devices = ['主机', '从机'].map((name, index) => ({
    id: `device-${index}`,
    name,
    position: { x: index * 300, y: 0 },
    templateSnapshot: {
      ...createDeviceTemplate(),
      terminals: [{ ...terminal, label: index ? 'B' : 'A' }],
    },
  }));
  project.harnesses = [
    {
      id: 'harness',
      name: '通信线束',
      number: 'H1',
      color: '#123456',
      collapsed: true,
    },
  ];
  project.wires = ['W1', 'W2'].map((number, index) => ({
    id: number,
    number,
    name: `信号${index}`,
    note: index ? '备用' : '工作',
    source: { deviceId: 'device-0', terminalId: 'pin' },
    target: { deviceId: 'device-1', terminalId: 'pin' },
    harnessId: 'harness',
  }));
  const onSelectWire = vi.fn();
  render(
    <InspectionPanel
      project={project}
      onSelectIssue={vi.fn()}
      onSelectWire={onSelectWire}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '从／到接线清单 (2)' }));
  expect(
    screen.getByRole('button', { name: '导出当前筛选结果（2 条）' }),
  ).toBeInTheDocument();
  const table = screen.getByRole('table', { name: '从／到接线清单' });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(within(table).getAllByText('通信线束')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: '定位导线 W1' }));
  expect(onSelectWire).toHaveBeenCalledWith('W1');
  fireEvent.change(screen.getByRole('textbox', { name: '筛选接线表' }), {
    target: { value: '备用' },
  });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  expect(within(table).queryByText('W1')).not.toBeInTheDocument();

  const createObjectURL = vi.fn((_blob: Blob) => 'blob:wires');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  let filename = '';
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download;
    });
  try {
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole('button', { name: '导出当前筛选结果（1 条）' }),
    );
    vi.runAllTimers();
    vi.useRealTimers();
    expect(filename).toBe('接线_项目-从到接线清单.csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:wires');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(csv).toContain('"W2"');
    expect(csv).not.toContain('"W1"');
    expect(csv).toContain('"主机","A","从机","B"');
    fireEvent.change(screen.getByRole('textbox', { name: '筛选接线表' }), {
      target: { value: '无匹配' },
    });
    expect(screen.getByText('没有匹配的导线记录')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出当前筛选结果（0 条）' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '线束明细表 (2)' }));
    expect(screen.getByRole('textbox', { name: '筛选接线表' })).toHaveValue(
      '无匹配',
    );
    expect(
      screen.getByRole('button', { name: '导出当前筛选结果（0 条）' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '筛选接线表' }), {
      target: { value: '工作' },
    });
    expect(screen.getByText('信号0')).toBeInTheDocument();
    expect(screen.queryByText('信号1')).not.toBeInTheDocument();
    vi.useFakeTimers();
    fireEvent.click(
      screen.getByRole('button', { name: '导出当前筛选结果（1 条）' }),
    );
    vi.runAllTimers();
    vi.useRealTimers();
    expect(filename).toBe('接线_项目-线束明细表.csv');
    const harnessCsv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(createObjectURL.mock.calls[1][0]);
    });
    expect(harnessCsv).toContain(
      '"线束编号","芯线","源设备/端子","目标设备/端子","状态","备注"',
    );
    expect(harnessCsv).toContain(
      '"H1","信号0","主机 / A","从机 / B","正常","工作"',
    );
    expect(harnessCsv).not.toContain('信号1');
    fireEvent.click(screen.getByRole('button', { name: '端子接线表 (4)' }));
    fireEvent.change(screen.getByRole('textbox', { name: '筛选接线表' }), {
      target: { value: 'W1' },
    });
    expect(
      screen.getByRole('button', { name: '导出当前筛选结果（2 条）' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '筛选接线表' }), {
      target: { value: '' },
    });
    expect(
      screen.getByRole('button', { name: '导出当前筛选结果（4 条）' }),
    ).toBeInTheDocument();
  } finally {
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
