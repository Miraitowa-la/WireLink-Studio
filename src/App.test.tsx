import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import App from './App';
import { createEmptyProject } from './model/project';

test('shows the project shell', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'WireLink Studio' }),
  ).toBeInTheDocument();
});

test('starts with an empty project instead of sample devices', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  expect(
    screen.getByText('0 台设备 · 0 条导线 · 0 个线束'),
  ).toBeInTheDocument();
  expect(screen.getByText('尚无设备模板')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /走线/ }),
  ).not.toBeInTheDocument();
});

test('undoes and redoes project edits', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  const name = screen.getByRole('textbox', { name: '工程名称' });
  fireEvent.change(name, { target: { value: '接线方案' } });
  expect(name).toHaveValue('接线方案');
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  expect(name).toHaveValue('未命名工程');
  fireEvent.click(screen.getByRole('button', { name: '重做' }));
  expect(name).toHaveValue('接线方案');
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  fireEvent.change(name, { target: { value: '另一个方案' } });
  expect(screen.getByRole('button', { name: '重做' })).toBeDisabled();
});

test('offers export formats and prepares the print diagram', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '新建工程' }));
  fireEvent.click(screen.getByText('导出'));
  for (const label of [
    '导出工程 JSON',
    '导出 SVG 图纸',
    '导出 PNG 图片',
    '导出离线 HTML 查看页',
  ]) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: '打印图纸或保存为 PDF' }));
  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  expect(document.querySelector('.print-sheet svg')).not.toBeNull();
  print.mockRestore();
});

test('clears harness routing when replacing the project', async () => {
  const project = createEmptyProject('已有工程');
  project.harnesses = [
    { id: 'harness', name: '测试线束', color: '#7045e5', collapsed: false },
  ];
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'existing.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('测试线束 · 待走线'));
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    expect(
      await screen.findByText('点击网格设置第一侧汇合点'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建' }));
    expect(screen.queryByText('点击网格设置第一侧汇合点')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('finishes harness routing on Enter using the last temporary point', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const project = createEmptyProject('走线工程');
  project.harnesses = [
    { id: 'harness', name: '测试线束', color: '#7045e5', collapsed: false },
  ];
  project.wires = ['one', 'two'].map((id) => ({
    id,
    harnessId: 'harness',
    source: { deviceId: 'left', terminalId: id },
    target: { deviceId: 'right', terminalId: id },
  }));
  project.devices = (['left', 'right'] as const).map((id, index) => ({
    id,
    name: id,
    position: { x: index * 360, y: 0 },
    templateSnapshot: {
      id,
      name: id,
      category: '',
      width: 180,
      height: 120,
      appearance: { kind: 'default' as const },
      terminals: ['one', 'two'].map((terminalId, order) => ({
        id: terminalId,
        label: terminalId,
        typeId: 'signal',
        side: (id === 'left' ? 'right' : 'left') as 'right' | 'left',
        order,
        maxConnections: 1,
      })),
    },
  }));
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'routing.wlproj',
      getFile: async () => ({ text: async () => JSON.stringify(project) }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('测试线束 · 待走线'));
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    const pane = document.querySelector('.react-flow__pane')!;
    const canvas = screen.getByLabelText('接线画布快捷键区域');
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText('点击网格设置第一侧汇合点')).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 90, clientY: 90 });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 180, clientY: 90 });
    fireEvent.keyDown(canvas, { key: 'Backspace' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.click(pane, { clientX: 240, clientY: 120 });
    const cancel = screen.getByRole('button', { name: '取消' });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    expect(screen.getByTitle('测试线束 · 待走线')).toBeInTheDocument();
    fireEvent.click(cancel);
    expect(screen.queryByText(/点击追加至少一个路径点/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '线束走线' }));
    fireEvent.click(pane, { clientX: 90, clientY: 90 });
    fireEvent.click(pane, { clientX: 240, clientY: 120 });
    fireEvent.keyDown(screen.getByRole('heading', { name: '资料库' }), {
      key: 'Enter',
    });
    expect(screen.getByText(/点击追加至少一个路径点/)).toBeInTheDocument();
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(await screen.findByTitle('测试线束 · 已折叠')).toBeInTheDocument();
    expect(
      screen.getAllByTitle('拖动调整；右键删除分支或主干路径点'),
    ).toHaveLength(2);
    fireEvent.contextMenu(
      screen.getAllByTitle('拖动调整；右键删除分支或主干路径点')[0],
    );
    fireEvent.click(screen.getByRole('button', { name: '重新走线' }));
    expect(
      screen.queryAllByTitle('拖动调整；右键删除分支或主干路径点'),
    ).toHaveLength(0);
    expect(screen.queryByRole('menu')).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('clears an unfinished wire when opening another project', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const makeProject = (name: string, id: string) => {
    const project = createEmptyProject(name);
    project.terminalTypes = [
      {
        id: 'signal',
        name: '信号',
        color: '#345',
        compatibleTypeIds: ['signal'],
      },
    ];
    project.devices = [
      {
        id,
        name,
        position: { x: 0, y: 0 },
        templateSnapshot: {
          id: `template-${id}`,
          name,
          category: '',
          width: 180,
          height: 120,
          appearance: { kind: 'default' as const },
          terminals: [
            {
              id: 'port',
              label: '端子',
              typeId: 'signal',
              side: 'right' as const,
              order: 0,
              maxConnections: 1,
            },
          ],
        },
      },
    ];
    return project;
  };
  const projects = [makeProject('旧工程', 'old'), makeProject('新工程', 'new')];
  vi.stubGlobal('showOpenFilePicker', async () => [
    {
      name: 'project.wlproj',
      getFile: async () => ({
        text: async () => JSON.stringify(projects.shift()),
      }),
    },
  ]);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '打开工程' }));
    fireEvent.click(await screen.findByTitle('端子 · 信号'));
    expect(screen.getByText(/点击网格点确定下一点/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '工程名称' })).toHaveValue(
        '新工程',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText(/点击网格点确定下一点/)).toBeNull(),
    );
    fireEvent.click(screen.getByTitle('端子 · 信号'));
    expect(screen.getByText(/点击网格点确定下一点/)).toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});
